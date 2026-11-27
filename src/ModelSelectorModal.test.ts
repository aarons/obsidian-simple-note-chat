import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    Modal: class {
        contentEl = new Element('div');
        constructor(_app: unknown) {}
        close() { (this as any).onClose(); }
    },
    Notice: class { hide() {} },
    setIcon: vi.fn(),
}));

import { ModelSelectorModal } from './ModelSelectorModal';
import { getModelSections, populateModelOptions, ProviderModel } from './ModelProvider';
import { DEFAULT_SETTINGS } from './types';

// Only the DOM operations used by the picker; no browser or Obsidian runtime required.
class Element {
    children: Element[] = [];
    attributes: Record<string, string> = {};
    dataset: Record<string, string> = {};
    events: Record<string, () => void> = {};
    textContent = '';
    value = '';
    label = '';
    scrollTop = 0;
    ownerDocument: { activeElement: Element | null; createElement: (tag: string) => Element };
    constructor(public tag: string, doc?: Element['ownerDocument']) {
        this.ownerDocument = doc ?? { activeElement: null, createElement: tag => new Element(tag, this.ownerDocument) };
    }
    empty() { this.children = []; }
    replaceChildren() { this.empty(); }
    addClass() {}
    appendChild(child: Element) { this.children.push(child); }
    createEl(tag: string, options: any = {}) {
        const child = new Element(tag, this.ownerDocument);
        child.textContent = options.text ?? '';
        child.attributes = options.attr ?? {};
        this.children.push(child);
        return child;
    }
    createDiv(options: any) { return this.createEl('div', options); }
    createSpan(options: any) { return this.createEl('span', options); }
    setAttribute(key: string, value: string) { this.attributes[key] = value; }
    addEventListener(event: string, handler: () => void) { this.events[event] = handler; }
    focus() { this.ownerDocument.activeElement = this; }
    all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
}

const models: ProviderModel[] = [
    { id: 'chatgpt/example', displayName: 'Example | subscription usage', provider: 'chatgpt' },
    { id: 'vendor/z', displayName: 'Z model | $2', provider: 'openrouter' },
    { id: 'vendor/a', displayName: 'A model | $1', provider: 'openrouter' },
    { id: 'vendor/image', displayName: 'Image model', provider: 'openrouter', isImageModel: true },
];

async function fixture(favoriteModels: string[] = []) {
    const plugin = {
        app: {}, settings: { ...DEFAULT_SETTINGS, defaultModel: models[0].id, favoriteModels },
        providerService: { fetchModels: vi.fn().mockResolvedValue({ models, errors: [] }) },
        saveSettings: vi.fn().mockResolvedValue(undefined),
    };
    const modal = new ModelSelectorModal(plugin as any);
    await modal.onOpen();
    const root = modal.contentEl as unknown as Element;
    const star = (id: string) => root.all().find(el => el.dataset.favoriteModel === id)!;
    const sections = () => root.all().filter(el => el.tag === 'section').map(el => el.attributes['aria-label']);
    return { plugin, modal, root, star, sections };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('model favorites', () => {
    it('puts favorites first without duplicates and preserves provider sort order', () => {
        const favorites = ['vendor/a', 'vendor/z', 'vendor/image', 'unavailable'];
        const sections = getModelSections(models, favorites);
        expect(sections.map(section => section.label)).toEqual(['Favorites', 'ChatGPT subscription · Using ChatGPT plan']);
        expect(sections[0].entries.map(model => model.id)).toEqual(['vendor/z', 'vendor/a', 'vendor/image']);
        expect(sections.flatMap(section => section.entries)).toHaveLength(models.length);
        expect(getModelSections(models).map(section => section.label)).toEqual([
            'ChatGPT subscription · Using ChatGPT plan', 'OpenRouter', 'OpenRouter · Image models',
        ]);
        const select = new Element('select');
        populateModelOptions(select as any, models, 'missing', 'Choose', favorites);
        expect(select.children[1].label).toBe('Favorites');
        expect(select.children[1].children.map(child => child.value)).toEqual(['vendor/z', 'vendor/a', 'vendor/image']);
        expect(select.value).toBe('missing');
        expect(select.children[select.children.length - 1].textContent).toContain('unavailable');
    });

    it('saves star toggles without selecting or closing, and restores sections on unstar', async () => {
        const { plugin, root, star, sections } = await fixture();
        star('vendor/image').focus();
        star('vendor/image').events.click();
        await settle();
        expect(plugin.settings.favoriteModels).toEqual(['vendor/image']);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        expect(plugin.settings.defaultModel).toBe('chatgpt/example');
        expect(sections()[0]).toBe('Favorites');
        expect(star('vendor/image').attributes['aria-pressed']).toBe('true');
        expect(root.ownerDocument.activeElement).toBe(star('vendor/image'));
        star('vendor/image').events.click();
        await settle();
        expect(plugin.settings.favoriteModels).toEqual([]);
        expect(sections()).not.toContain('Favorites');
        expect(sections()[sections().length - 1]).toBe('OpenRouter · Image models');
        expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    });

    it('loads saved favorites, filters them, and keeps unavailable favorites stored', async () => {
        const { plugin, root, star, sections } = await fixture(['vendor/z', 'missing']);
        expect(sections()[0]).toBe('Favorites');
        expect(star('vendor/z').attributes['aria-pressed']).toBe('true');
        const search = root.all().find(el => el.tag === 'input')!;
        search.value = 'vendor/z';
        search.events.input();
        expect(root.all().filter(el => el.dataset.favoriteModel).map(el => el.dataset.favoriteModel)).toEqual(['vendor/z']);
        star('vendor/z').events.click();
        await settle();
        expect(plugin.settings.favoriteModels).toEqual(['missing']);
        expect(sections()).toEqual(['OpenRouter']);
        search.value = 'no match';
        search.events.input();
        expect(root.all().some(el => el.textContent === 'No models match your search.')).toBe(true);
    });

    it('rolls back favorites when persistence fails and allows retry', async () => {
        const { plugin, star, sections } = await fixture();
        plugin.saveSettings.mockRejectedValueOnce(new Error('Disk full'));
        star('vendor/a').events.click();
        await settle();
        expect(plugin.settings.favoriteModels).toEqual([]);
        expect(sections()).not.toContain('Favorites');
        expect(star('vendor/a').attributes['aria-pressed']).toBe('false');
        star('vendor/a').events.click();
        await settle();
        expect(plugin.settings.favoriteModels).toEqual(['vendor/a']);
    });

    it('still saves a chosen model and closes the picker', async () => {
        const { plugin, root } = await fixture(['vendor/a']);
        const select = root.all().find(el => el.tag === 'button' && el.children.some(child => child.textContent === 'A model | $1'))!;
        select.events.click();
        await settle();
        expect(plugin.settings.defaultModel).toBe('vendor/a');
        expect(plugin.settings.favoriteModels).toEqual(['vendor/a']);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        expect(root.children).toEqual([]);
    });
});

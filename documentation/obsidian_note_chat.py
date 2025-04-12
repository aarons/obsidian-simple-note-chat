import sys
import os
import random
from chat_api import ChatAPI
from logging_config import setup_logger

logger = setup_logger()

def filter_messages(messages):
    return [
        msg for msg in messages
        if msg['content'].strip() not in ['cc', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']
    ]

def parse_markdown_file(file_path):
    logger.info(f"Parsing markdown file: {file_path}")
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read()

        messages = []
        blocks = content.split('---')

        if len(blocks) == 1:
            # If there are no delimiters, treat the entire content as a single user message
            messages.append({"role": "user", "content": content.strip()})
        else:
            for i, block in enumerate(blocks):
                if block.strip():  # Only add non-empty blocks
                    role = "user" if i % 2 == 0 else "assistant"
                    messages.append({"role": role, "content": block.strip()})

        logger.debug(f"Parsed {len(messages)} messages from the file")
        return messages
    except Exception as e:
        logger.error(f"Error parsing markdown file: {str(e)}")
        return None

def get_random_phrase(file_path='obsidian_note_chat_phrases.txt'):
    logger.info(f"Getting random phrase from file: {file_path}")
    script_base_path = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_base_path, file_path)

    with open(file_path, 'r', encoding='utf-8') as file:
        phrases = file.read().splitlines()
    return random.sample(phrases, 1)[0]

def process_markdown(file_path, model=None):
    logger.info(f"Processing markdown file: {file_path}")
    messages = parse_markdown_file(file_path)
    if messages is None:
        logger.warning("Failed to parse markdown file, aborting process")
        return None

    # Filter out 'cc', 'c0', 'c1', ..., 'c7' messages
    messages = filter_messages(messages)

    if not model:
        model = 'claude-3-7-sonnet-latest'

    # Remove lines containing only 'cc', 'c0', 'c1', ..., 'c7' and add "Calling..." message
    with open(file_path, 'r+', encoding='utf-8') as file:
        content = file.read()
        content_lines = content.strip().split('\n')
        content = '\n'.join([line for line in content_lines if line.strip() not in ['cc', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']])
        file.seek(0)
        file.truncate()
        file.write(content)
        file.write(f"\n\n---\n\nCalling {model}...\n")

    # Initialize ChatAPI
    chat = ChatAPI()
    system_message = "You help with whatever is asked to the best of your ability."

    try:
        logger.info(f"Sending message to API using model: {model}")
        logger.info(f"messages: {messages}")
        # Send the message using the new API
        response = chat.send_message(
            messages=messages,
            model=model,
            max_completion_tokens=2000,
            system_message=system_message
        )

        logger.info(f"response: {response}")
        # Remove "Calling..." and append the response to the file
        with open(file_path, 'r+', encoding='utf-8') as file:
            content = file.read().strip()
            file.seek(0)
            file.truncate()
            file.write(content.replace(f"\n\n---\n\nCalling {model}...", ""))
            file.write(f"\n\n---\n\n{response}\n\n---\n\n")

        logger.info("Successfully received and wrote response to file")
        return response
    except Exception as e:
        # If an error occurs, remove "Calling..." and log the error
        with open(file_path, 'r+', encoding='utf-8') as file:
            content = file.read().strip()
            file.seek(0)
            file.truncate()
            content = content.replace(f"\n\n---\n\nCalling {model}...", "")
            file.write(content)
            file.write(f"\n\n---\n\nError: {str(e)}\n\n---\n\n")
        logger.error(f"Error during API call: {str(e)}")
        return None

def main():
    logger.info("Starting chat_with_note script")
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        logger.error("Invalid number of arguments")
        logger.error("Usage: python script_name.py <path_to_markdown_file> [model]")
        sys.exit(1)

    file_path = sys.argv[1]
    logger.info(f"Processing file: {file_path}")
    if len(sys.argv) == 3:
        model = sys.argv[2]
        logger.info(f"Using specified model: {model}")
        result = process_markdown(file_path, model)
    else:
        logger.info("Using default model")
        result = process_markdown(file_path)

    if result:
        logger.info("Response added to the file successfully.")
        print("Response added to the file successfully.")
    else:
        logger.error("Failed to process markdown file.")

if __name__ == '__main__':
    main()

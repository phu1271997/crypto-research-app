from pathlib import Path

# Modify article_writer.py
p1 = Path('/opt/Dang-bai-X-bot/src/researcher/article_writer.py')
content1 = p1.read_text(encoding='utf-8')
content1 = content1.replace('max_tokens=1000,', 'max_tokens=2500,')
content1 = content1.replace('max_tokens=4000,', 'max_tokens=8000,')
p1.write_text(content1, encoding='utf-8')
print('article_writer.py updated.')

# Modify thread_writer.py
p2 = Path('/opt/Dang-bai-X-bot/src/twitter_writer/thread_writer.py')
content2 = p2.read_text(encoding='utf-8')
content2 = content2.replace('max_tokens=2000,', 'max_tokens=4000,')
p2.write_text(content2, encoding='utf-8')
print('thread_writer.py updated.')

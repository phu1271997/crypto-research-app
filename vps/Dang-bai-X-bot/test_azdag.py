import asyncio
from src.publishers.azdag import publish_to_azdag
from src.settings import settings

async def main():
    article = {
        "title": "Bản tin thử nghiệm AZDAG qua API mới",
        "content": "Đây là nội dung bản tin. \n\nChúng tôi đang thử nghiệm việc đăng bài tự động qua API của hệ thống CNT Research.",
        "excerpt": "Bản tin thử nghiệm API."
    }
    print(f"API Key: {settings.azdag_api_key}")
    res = await publish_to_azdag(article, None, None)
    print(res)

if __name__ == "__main__":
    asyncio.run(main())

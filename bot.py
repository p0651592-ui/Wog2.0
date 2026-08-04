import asyncio
import logging
import os
import aiohttp
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.utils.keyboard import InlineKeyboardBuilder

# Configuration from environment variables
BOT_TOKEN = os.getenv("BOT_TOKEN")
SERVER_URL = os.getenv("SERVER_URL", "http://localhost:8000")
MINI_APP_URL = os.getenv("MINI_APP_URL", "https://t.me")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN environment variable is required")

logging.basicConfig(level=logging.INFO)
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

async def keep_server_alive():
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(SERVER_URL) as response:
                    if response.status == 200:
                        logging.info("Anti-Sleep: server is alive")
                    else:
                        logging.warning(f"Anti-Sleep: status {response.status}")
        except Exception as e:
            logging.error(f"Anti-Sleep error: {e}")
        await asyncio.sleep(600)

@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    kb = InlineKeyboardBuilder()
    kb.button(
        text="🎰 Запустить WOG Casino",
        web_app=types.WebAppInfo(url=MINI_APP_URL)
    )

    welcome_text = (
        f"🌟 Добро пожаловать в игровой лаунчер **WOG Casino**, {message.from_user.first_name}!\n\n"
        "У нас вы можете играть в захватывающие премиум-игры на виртуальные монеты **W-Coins**.\n"
        "Ваш стартовый баланс уже ожидает вас внутри приложения.\n\n"
        "Нажмите на кнопку ниже, чтобы начать игру прямо сейчас! 👇"
    )

    await message.answer(welcome_text, parse_mode="Markdown", reply_markup=kb.as_markup())

async def main():
    asyncio.create_task(keep_server_alive())
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())

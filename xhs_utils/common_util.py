import os
from loguru import logger
from dotenv import load_dotenv
from runtime_paths import DATA_ROOT, PROJECT_ROOT

def load_env():
    load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
    cookies_str = os.getenv('COOKIES')
    return cookies_str

def init():
    media_base_path = str((DATA_ROOT / 'media_datas').resolve())
    excel_base_path = str((DATA_ROOT / 'excel_datas').resolve())
    for base_path in [media_base_path, excel_base_path]:
        if not os.path.exists(base_path):
            os.makedirs(base_path)
            logger.info(f'创建目录 {base_path}')
    cookies_str = load_env()
    base_path = {
        'media': media_base_path,
        'excel': excel_base_path,
    }
    return cookies_str, base_path

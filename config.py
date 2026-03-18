import os
from dotenv import load_dotenv

# Load .env file
load_dotenv(override=True)

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")

    # Neon Database
    DATABASE_URL = os.getenv("DATABASE_URL")

    # Email (Google Apps Script Webhook)
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    GOOGLE_SCRIPT_URL = os.getenv("GOOGLE_SCRIPT_URL")

    # Cloudinary
    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
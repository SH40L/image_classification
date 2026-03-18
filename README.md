# 🖼️ Image Classification Web App

A full-stack, machine learning web application built with Flask and TensorFlow. This application allows users to create accounts, upload images (via local files or direct URLs), and classify them using a custom Convolutional Neural Network (CNN). 

This project has been modernized for the cloud, featuring a serverless PostgreSQL database, cloud image storage, and an instant HTTP-based email verification system.

## ✨ Features
* **Custom ML Model:** Classifies images into 8 distinct categories using a pre-trained TensorFlow/Keras `.hdf5` model.
* **Cloud Storage:** User-uploaded images are securely uploaded and served via Cloudinary.
* **Instant Email Verification:** Bypasses traditional SMTP blocks by utilizing a custom Google Apps Script Webhook for instant email delivery.
* **User Authentication:** Secure login, registration, and password reset functionality using `Flask-Login` and `Werkzeug` password hashing.
* **Search History:** Users can view their past classifications, complete with pagination and filtering.
* **Cloud Database:** Fully migrated to a Neon Tech PostgreSQL database.

## 🎯 Supported Categories
For the best results, upload images containing one of the following:
* Angry
* Crying
* Happy
* Male
* Female
* Sitting Dog
* Running Dog
* Fighting Dog

## 🛠️ Tech Stack
* **Backend:** Python, Flask
* **Machine Learning:** TensorFlow, Keras, Pillow
* **Database:** PostgreSQL (Neon Tech), `psycopg2`
* **Cloud Storage:** Cloudinary API
* **Email API:** Custom Google Apps Script (Webhook via `requests`)
* **Deployment Setup:** Docker, Gunicorn (Optimized for Hugging Face Spaces)

## 🚀 Environment Variables (`.env`)
To run this project, you will need to create a `.env` file in the root directory with the following secrets:

```env
SECRET_KEY=your_flask_secret_key
DATABASE_URL=your_neon_postgres_url
GOOGLE_SCRIPT_URL=your_google_apps_script_web_app_url
MAIL_USERNAME=your_verified_gmail_address
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

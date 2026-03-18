# 🖼️ Image Classification Web App (Cloud Edition)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Hugging%20Face-yellow)](https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME)
[![Python](https://img.shields.io/badge/Python-3.10-blue)](https://www.python.org/)
[![Framework](https://img.shields.io/badge/Framework-Flask-red)](https://flask.palletsprojects.com/)
[![Model](https://img.shields.io/badge/Model-TensorFlow%20%7C%20CNN-brightgreen)](https://www.tensorflow.org/)
[![Database](https://img.shields.io/badge/Database-Neon%20PostgreSQL-orange)](https://neon.tech/)

## 📌 Project Overview
This repository contains the source code for a fully containerized, cloud-deployed Image Classification web application. The system utilizes a Convolutional Neural Network (CNN) to classify user-uploaded images into distinct categories. 

This branch represents the **Production/Cloud deployment**. It features a serverless PostgreSQL database, cloud image storage, and a custom HTTP-based email verification system designed to bypass standard cloud SMTP restrictions.

**👉 [CLICK HERE TO VIEW THE LIVE APPLICATION DEMO](https://sh40l-image-classification-app.hf.space/)

---

## 🧠 Methodology and Architecture
This project processes user inputs and images through a modernized cloud pipeline:

### 1. Cloud Data Storage & Serverless Auth
User accounts, hashed passwords, and search histories are managed via a **Neon Tech PostgreSQL** database. Because standard SMTP ports are blocked on most free cloud platforms, the system uses a custom **Google Apps Script Webhook** to send instant verification and password reset emails directly over HTTPS (Port 443).

### 2. Image Processing & CNN Classification
User images are safely uploaded to the **Cloudinary API** rather than local storage, preventing file loss when server containers restart. The secure URL is fetched in memory, resized to 32x32 pixels, and fed into a pre-trained **TensorFlow/Keras** `.hdf5` model to predict the highest probability class.

---

## 🎯 Supported Categories
For the best results, the AI is trained to recognize the following:
* Angry, Crying, Happy
* Male, Female
* Sitting Dog, Running Dog, Fighting Dog

---

## 🚀 Cloud Deployment Configuration
This application is fully containerized and production-ready. It includes a `Dockerfile` and uses `gunicorn` to bind to port `7860`, making it directly deployable to **Hugging Face Spaces**.

### Environment Secrets
Do **not** upload a `.env` file to your public repository. To run this project, configure the following variables as **Secrets** in your Hugging Face Space settings:

```env
SECRET_KEY=your_flask_secret_key
DATABASE_URL=your_neon_postgres_url
GOOGLE_SCRIPT_URL=your_google_apps_script_web_app_url
MAIL_USERNAME=your_verified_gmail_address
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
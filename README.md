# 🖼️ Image Classification Web App (Local Environment Version)

[![Python](https://img.shields.io/badge/Python-3.10-blue)](https://www.python.org/)
[![Framework](https://img.shields.io/badge/Framework-Flask-red)](https://flask.palletsprojects.com/)
[![Model](https://img.shields.io/badge/Model-TensorFlow%20%7C%20CNN-brightgreen)](https://www.tensorflow.org/)
[![Database](https://img.shields.io/badge/Database-MySQL%20(XAMPP)-orange)](https://www.apachefriends.org/)

## 📌 Project Overview
This repository contains the source code for a full-stack Image Classification web application. It utilizes a custom Convolutional Neural Network (CNN) to classify images into 8 distinct categories. 

**Note:** This specific branch represents the **local development environment**. It relies on a local XAMPP server for the database, local file storage for images, and standard SMTP ports for email verification.

---

## 🧠 Methodology and Architecture
This project processes user inputs and images through a local pipeline:

### 1. Local Data Storage & User Auth
User accounts, hashed passwords, and search histories are managed via a local **MySQL** database (typically run through XAMPP). The system uses `Flask-Login` for session management and `Flask-Mail` via SMTP for account verification.

### 2. Image Processing & CNN Classification
Uploaded images are saved locally to the `static/images` directory. The image is resized to 32x32 pixels, normalized, and fed into a pre-trained **TensorFlow/Keras** `.hdf5` model to predict the highest probability class among the trained categories.

---

## 🎯 Supported Categories
For the best results, upload images containing one of the following:
* Angry, Crying, Happy
* Male, Female
* Sitting Dog, Running Dog, Fighting Dog

---

## 💻 Local Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/SH40L/image_classification](https://github.com/SH40L/image_classification)
   cd your-repo-name
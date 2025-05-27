document.addEventListener('DOMContentLoaded', function () {
    var modal = document.getElementById("codeModal");
    var codeDisplay = document.getElementById("codeDisplay");
    var copyBtn = document.querySelector(".copy-btn");
    var span = document.getElementsByClassName("close")[0];

    var codes = {
        "app.py": `
import ast
import math
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_login import LoginManager, login_user, logout_user, login_required, UserMixin, current_user
from flask_mysqldb import MySQL
from flask_mail import Mail, Message
from werkzeug.security import generate_password_hash, check_password_hash
import os
import uuid
import urllib
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import load_img, img_to_array
import time


app = Flask(__name__)
app.config.from_object('config.Config')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = load_model(os.path.join(BASE_DIR, 'model.hdf5'))
mysql = MySQL(app)
mail = Mail(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

ALLOWED_EXT = set(['jpg', 'jpeg', 'png', 'jfif'])

UPLOAD_FOLDER = os.path.join('static', 'images')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

classes = ['angry', 'crying', 'fighting_dog', 'happy', 'male', 'female', 'running_dog', 'sitting_dog']

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1] in ALLOWED_EXT

def predict(filename, model):
    img = load_img(filename, target_size=(32, 32))
    img = img_to_array(img)
    img = img.reshape(1, 32, 32, 3)
    img = img.astype('float32')
    img = img / 255.0
    result = model.predict(img)

    dict_result = {result[0][i]: classes[i] for i in range(len(classes))}

    res = result[0]
    res.sort()
    res = res[::-1]
    prob = res[:3]

    prob_result = [(prob[i] * 100).round(2) for i in range(3)]
    class_result = [dict_result[prob[i]] for i in range(3)]

    return class_result, prob_result

class User(UserMixin):
    def __init__(self, id, username, email, first_name, last_name):
        self.id = id
        self.username = username
        self.email = email
        self.first_name = first_name
        self.last_name = last_name

@login_manager.user_loader
def load_user(user_id):
    cursor = mysql.connection.cursor()
    cursor.execute("SELECT id, username, email, first_name, last_name FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    cursor.close()
    if user:
        return User(user[0], user[1], user[2], user[3], user[4])
    return None

s = URLSafeTimedSerializer(app.config['SECRET_KEY'])

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main'))
    if request.method == 'POST':
        first_name = request.form['first_name']
        last_name = request.form['last_name']
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        
        if password != confirm_password:
            flash('Passwords do not match.', 'danger')
            return redirect(url_for('register'))
        
        cursor = mysql.connection.cursor()
        cursor.execute("SELECT * FROM users WHERE username = %s OR email = %s", (username, email))
        existing_user = cursor.fetchone()

        if existing_user:
            flash('This email or username is already in use, try another one.', 'danger')
            return redirect(url_for('register'))
        else:
            hashed_password = generate_password_hash(password)
            cursor.execute("INSERT INTO users (first_name, last_name, username, email, password, verified) VALUES (%s, %s, %s, %s, %s, %s)", 
                           (first_name, last_name, username, email, hashed_password, False))
            mysql.connection.commit()
            cursor.close()
            flash('A verification email has been sent to your email address. Please verify before Login', 'success')

            token = s.dumps(email, salt='email-confirm')
            msg = Message('Email Verification', sender=app.config['MAIL_USERNAME'], recipients=[email])
            link = url_for('confirm_email', token=token, _external=True)
            msg.body = render_template('logout-user/email_verification.txt', link=link)
            mail.send(msg)

            return redirect(url_for('login'))
    return render_template('logout-user/register.html')

@app.route('/confirm_email/<token>')
def confirm_email(token):
    try:
        email = s.loads(token, salt='email-confirm', max_age=3600)
    except SignatureExpired:
        return '<h1>The token is expired!</h1>'
    except BadSignature:
        return '<h1>Invalid token!</h1>'

    cursor = mysql.connection.cursor()
    cursor.execute("UPDATE users SET verified = %s WHERE email = %s", (True, email))
    mysql.connection.commit()
    cursor.close()
    
    flash('Your email has been verified! Please use your username and password to login.', 'success')
    time.sleep(3)  # Pause for 3 seconds before redirecting
    return redirect(url_for('login'))

@app.route('/reset_password', methods=['GET', 'POST'])
def reset_password():
    if current_user.is_authenticated:
        return redirect(url_for('main'))
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        
        cursor = mysql.connection.cursor()
        cursor.execute("SELECT id FROM users WHERE username = %s AND email = %s", (username, email))
        user = cursor.fetchone()
        
        if user:
            token = s.dumps(email, salt='password-reset')
            msg = Message('Password Reset Request', sender=app.config['MAIL_USERNAME'], recipients=[email])
            link = url_for('reset_password_token', token=token, _external=True)
            msg.body = render_template('logout-user/reset-password/password_reset.txt', link=link)
            mail.send(msg)
            flash('A password reset link has been sent to your email address. Please verify it.', 'success')
            cursor.close()
            return redirect(url_for('login'))
        else:
            flash('Invalid username or email. Please try again.', 'danger')
        
        cursor.close()
        
    # Render the reset_password template even if the credentials are invalid
    return render_template('logout-user/reset-password/reset_password.html')

@app.route('/reset_password/<token>', methods=['GET', 'POST'])
def reset_password_token(token):
    try:
        email = s.loads(token, salt='password-reset', max_age=3600)
    except SignatureExpired:
        return '<h1>The token is expired!</h1>'
    except BadSignature:
        return '<h1>Invalid token!</h1>'
    
    if request.method == 'POST':
        password = request.form['password']
        confirm_password = request.form['confirm_password']
        
        if password != confirm_password:
            flash('Passwords do not match.', 'danger')
            return redirect(url_for('reset_password_token', token=token))
        
        hashed_password = generate_password_hash(password)
        
        cursor = mysql.connection.cursor()
        cursor.execute("UPDATE users SET password = %s WHERE email = %s", (hashed_password, email))
        mysql.connection.commit()
        cursor.close()
        
        flash('Your password has been reset! Please use your username and new password to login.', 'success')
        time.sleep(3)  # Pause for 3 seconds before redirecting
        return redirect(url_for('login'))
    
    # Flash message for verified email
    flash('Your email is verified. Please enter your new password to continue.', 'success')
    return render_template('logout-user/reset-password/reset_password_token.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main'))
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        cursor = mysql.connection.cursor()
        cursor.execute("SELECT id, username, email, password, verified, first_name, last_name FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        cursor.close()
        if user and check_password_hash(user[3], password):
            if user[4]:
                login_user(User(user[0], user[1], user[2], user[5], user[6]))
                return redirect(url_for('main'))
            else:
                flash('Please verify your email before logging in.', 'danger')
                return redirect(url_for('login'))
        else:
            flash('Invalid credentials, please try again.', 'danger')
            return redirect(url_for('login'))
    return render_template('logout-user/login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('main'))

@app.route('/')
def main():
    if current_user.is_authenticated:
        return render_template('logged_in_base.html')
    return render_template('logout-user/index.html')

@app.route('/image_classification')
@login_required
def image_classification():
    return render_template('image_classification.html')

@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    if request.method == 'POST':
        first_name = request.form.get('first_name', current_user.first_name)
        last_name = request.form.get('last_name', current_user.last_name)
        username = request.form.get('username', current_user.username)
        email = request.form.get('email', current_user.email)

        cursor = mysql.connection.cursor()
        cursor.execute("SELECT password FROM users WHERE id = %s", (current_user.id,))
        user = cursor.fetchone()

        cursor.execute("UPDATE users SET first_name = %s, last_name = %s, username = %s, email = %s WHERE id = %s", 
                       (first_name, last_name, username, email, current_user.id))
        mysql.connection.commit()
        cursor.close()
        flash('Profile updated successfully.', 'success')
    return render_template('profile.html', user=current_user)

@app.route('/history')
@login_required
def history():
    page = request.args.get('page', 1, type=int)
    selected_class = request.args.get('class', '')

    cursor = mysql.connection.cursor()
    cursor.execute("SELECT image_path, result, created_at FROM search_history WHERE user_id = %s", (current_user.id,))
    history = cursor.fetchall()
    cursor.close()
    
    # Parse the result string to a dictionary
    parsed_history = []
    class_options = set()
    for entry in history:
        image_path, result_str, created_at = entry
        result_dict = ast.literal_eval(result_str)
        parsed_history.append((image_path, result_dict, created_at))
        
        for i in range(1, 4):
            class_name = result_dict['class' + str(i)]
            class_options.add(class_name)

    # Filter by selected class
    if selected_class:
        parsed_history = [entry for entry in parsed_history if selected_class in entry[1].values()]
        # Sort by the percentage of the selected class in descending order
        parsed_history.sort(key=lambda x: next(v for k, v in x[1].items() if k.startswith('prob') and x[1]['class' + k[-1]] == selected_class), reverse=True)

    # Sort class options alphabetically
    sorted_class_options = sorted(class_options)

    # Pagination
    results_per_page = 10
    total_results = len(parsed_history)
    total_pages = math.ceil(total_results / results_per_page)
    
    start_index = (page - 1) * results_per_page
    end_index = start_index + results_per_page
    paginated_history = parsed_history[start_index:end_index]

    # Determine the range of pages to display
    range_size = 5
    start_page = max(1, page - range_size // 2)
    end_page = min(total_pages, start_page + range_size - 1)
    if end_page - start_page < range_size:
        start_page = max(1, end_page - range_size + 1)
    
    pagination_range = range(start_page, end_page + 1)

    return render_template('history.html', 
                           history=paginated_history, 
                           class_options=sorted_class_options, 
                           selected_class=selected_class, 
                           total_pages=total_pages, 
                           current_page=page, 
                           pagination_range=pagination_range)


@app.route('/about_project')
@login_required
def about_project():
    return render_template('about_project.html')

@app.route('/codes')
@login_required
def codes():
    return render_template('codes.html')

@app.route('/presentation')
@login_required
def presentation():
    return render_template('presentation.html')

@app.route('/report')
@login_required
def report():
    return render_template('report.html')

@app.route('/group_members')
@login_required
def group_members():
    return render_template('group_members.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@app.route('/success', methods=['GET', 'POST'])
@login_required
def success():
    error = ''
    target_img = os.path.join(os.getcwd(), 'static/images')
    if not os.path.exists(target_img):
        os.makedirs(target_img)
    if request.method == 'POST':
        if request.form:
            link = request.form.get('link')
            try:
                resource = urllib.request.urlopen(link)
                unique_filename = str(uuid.uuid4())
                filename = unique_filename + ".jpg"
                img_path = os.path.join(target_img, filename)
                output = open(img_path, "wb")
                output.write(resource.read())
                output.close()
                img = filename

                class_result, prob_result = predict(img_path, model)

                predictions = {
                    "class1": class_result[0],
                    "class2": class_result[1],
                    "class3": class_result[2],
                    "prob1": prob_result[0],
                    "prob2": prob_result[1],
                    "prob3": prob_result[2],
                }

                cursor = mysql.connection.cursor()
                cursor.execute("INSERT INTO search_history (user_id, image_path, result) VALUES (%s, %s, %s)", (current_user.id, img, str(predictions)))
                mysql.connection.commit()
                cursor.close()

            except Exception as e:
                print(str(e))
                error = "Something went wrong with the provided link. Try another link or upload an image."

        if 'file' in request.files:
            file = request.files['file']
            if file and allowed_file(file.filename):
                unique_filename = str(uuid.uuid4())
                filename = unique_filename + ".jpg"
                img_path = os.path.join(target_img, filename)
                file.save(img_path)
                img = filename

                class_result, prob_result = predict(img_path, model)

                predictions = {
                    "class1": class_result[0],
                    "class2": class_result[1],
                    "class3": class_result[2],
                    "prob1": prob_result[0],
                    "prob2": prob_result[1],
                    "prob3": prob_result[2],
                }

                cursor = mysql.connection.cursor()
                cursor.execute("INSERT INTO search_history (user_id, image_path, result) VALUES (%s, %s, %s)", (current_user.id, img, str(predictions)))
                mysql.connection.commit()
                cursor.close()

                return render_template('success.html', img=img, predictions=predictions)
            else:
                error = "Please upload images of jpg, jpeg, and png extension only"

        if len(error) == 0:
            return render_template('success.html', img=img, predictions=predictions)
        else:
            return render_template('image_classification.html', error=error)
    else:
        return render_template('image_classification.html')

if __name__ == "__main__":
    app.run(debug=True) 
        `,
        "config.py": `
    class Config:
    SECRET_KEY = 'your_secret_key'
    MYSQL_HOST = 'localhost'
    MYSQL_USER = 'sh40l'
    MYSQL_PASSWORD = 'ShaOl_10'
    MYSQL_DB = 'image_classification_db'
    
    # Flask-Mail configuration
    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USE_SSL = False
    MAIL_USERNAME = 'imgclassify.verify.your.email@gmail.com'
    MAIL_PASSWORD = 'zivx zbqk sndz bpjc'
    MAIL_DEFAULT_SENDER = 'imgclassify.verify.your.email@gmail.com'

        `,
        "base.html": `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>{% block title %}Image Classification{% endblock %}</title>
            <link rel="stylesheet" href="{{ url_for('static', filename='css/styles.css') }}">
            <link rel="icon" href="../../static/instance/images/favicon.png" type="image/png">
        
        </head>
        <body>
            <div class="background">
                <nav>
                    <div class="container">
                        <a href="{{ url_for('main') }}" class="logo"><img src="{{ url_for('static', filename='instance/images/logo-01.png') }}" alt="Logo"></a>
                        <div class="nav-links">
                            {% if current_user.is_authenticated %}
                                <a href="{{ url_for('home') }}">Classify Image</a>
                                <a href="{{ url_for('profile') }}">Profile</a>
                                <a href="{{ url_for('history') }}">History</a>
                                <a href="{{ url_for('logout') }}">Logout</a>
                            {% else %}
                                <a href="{{ url_for('login') }}" class="login-link">Login</a>
                                <a href="{{ url_for('register') }}" class="register-link">Register</a>
                            {% endif %}
                        </div>
                    </div>
                </nav>
                <div class="content">
                    {% with messages = get_flashed_messages(with_categories=true) %}
                        {% if messages %}
                            <ul class="flashes">
                                {% for category, message in messages %}
                                    <li class="{{ category }}">{{ message }}</li>
                                {% endfor %}
                            </ul>
                        {% endif %}
                    {% endwith %}
                    {% block content %}{% endblock %}
                </div>
                <footer>
                    <p>SHAOL TECH | Kazi Nur Ali (Kazol)</p>
                </footer>
            </div>
        </body>
        </html>
        `,
        "index.html": `
        {% extends "logout-user/base.html" %}
        {% block title %}Home{% endblock %}
        {% block content %}
        <div class="center-content">
            <h1 class="welcome">Welcome</h1>
            <p class="subtext">to Image Classification</p>
            <p class="description">This is the homepage. Please login or register to use the image classification tool.</p>
            <div class="buttons">
                <a href="{{ url_for('register') }}" class="register-button">New Here? Join Us Now</a>
                <a href="{{ url_for('login') }}" class="login-button">Already Joined! LogIn</a>
            </div>
        </div>
        {% endblock %}
        `,
        "register.html": `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Register</title>
            <link rel="stylesheet" href="{{ url_for('static', filename='css/login-register-style.css') }}">
            <link rel="icon" href="../../static/instance/images/favicon.png" type="image/png">
        
        </head>
        <body>
            <div class="divfimg">
                <a href="{{ url_for('main') }}" class="fimg"><img src="{{ url_for('static', filename='instance/images/logo.png') }}" alt="Logo"></a>
                <div class="form-container">
                    <h2>Sign Up</h2>
                    <hr>
                    {% with messages = get_flashed_messages(with_categories=true) %}
                    {% if messages %}
                    {% for category, message in messages %}
                    <div class="flash-message {{ category }}">{{ message }}</div>
                    {% endfor %}
                    {% endif %}
                    {% endwith %}
                    <form method="POST" action="{{ url_for('register') }}">
                        <label for="first_name">First Name<span class="star">*</span></label>
                        <input type="text" id="first_name" name="first_name" required>
        
                        <label for="last_name">Last Name<span class="star">*</span></label>
                        <input type="text" id="last_name" name="last_name" required>
        
                        <label for="username">Username<span class="star">*</span></label>
                        <input type="text" id="username" name="username" required>
        
                        <label for="email">Email<span class="star">*</span></label>
                        <input type="email" id="email" name="email" required>
        
                        <label for="password">Password<span class="star">*</span></label>
                        <input type="password" id="password" name="password" required>
        
                        <label for="confirm_password">Confirm Password<span class="star">*</span></label>
                        <input type="password" id="confirm_password" name="confirm_password" required>
        
                        <button type="submit">Register</button>
                    </form>
                    <p>Already Joined? <a href="{{ url_for('login') }}">Log In</a></p>
                </div>
            </div>
        </body>
        </html>
        `,
        "login.html": `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login</title>
            <link rel="stylesheet" href="{{ url_for('static', filename='css/login-register-style.css') }}">
            <link rel="icon" href="../../static/instance/images/favicon.png" type="image/png">
        
        </head>
        <body>
            <div class="divfimg">
                <a href="{{ url_for('main') }}" class="fimg"><img src="{{ url_for('static', filename='instance/images/logo.png') }}" alt="Logo"></a>
                <div class="form-container">
                    <h2>Login</h2>
                    <hr>
                    {% with messages = get_flashed_messages(with_categories=true) %}
                    {% if messages %}
                    {% for category, message in messages %}
                    <div class="flash-message {{ category }}">{{ message }}</div>
                    {% endfor %}
                    {% endif %}
                    {% endwith %}
                    <form method="POST" action="{{ url_for('login') }}">
                        <label for="username">Username<span class="star">*</span></label>
                        <input type="text" id="username" name="username" required>
                        <label for="password">Password<span class="star">*</span></label>
                        <input type="password" id="password" name="password" required>
                        <button type="submit">Login</button>
                    </form>
                    <p>Forgot your password? <a href="{{ url_for('reset_password') }}">Reset Password</a></p>
                    <hr>
                    <div class="logreg-container">
                        <button class="logreg"><a href="{{ url_for('register') }}">Join Us Now</a></button>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `,
        "reset_password.html": `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Password</title>
            <link rel="stylesheet" href="{{ url_for('static', filename='css/login-register-style.css') }}">
            <link rel="icon" href="../../../static/instance/images/favicon.png" type="image/png">
        
        </head>
        <body>
            <div class="divfimg">
                <a href="{{ url_for('main') }}" class="fimg"><img src="{{ url_for('static', filename='instance/images/logo.png') }}" alt="Logo"></a>
                <div class="form-container">
                    <h2>Reset Password</h2>
                    <hr>
        
                    <!-- Flash messages section -->
                    {% with messages = get_flashed_messages(with_categories=true) %}
                        {% if messages %}
                            {% for category, message in messages %}
                                <div class="flash-message {{ category }}">{{ message }}</div>
                            {% endfor %}
                        {% endif %}
                    {% endwith %}
        
                    <form method="post">
                        <label for="username">Username<span class="star">*</span></label>
                        <input type="text" id="username" name="username" required>
                        <label for="email">Email<span class="star">*</span></label>
                        <input type="email" id="email" name="email" required>
                        <button type="submit">Submit</button>
                    </form>
                </div>
            </div>
        </body>
        </html>
        `,
        "reset_password_token.html": `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Password</title>
            <link rel="stylesheet" href="{{ url_for('static', filename='css/login-register-style.css') }}">
            <link rel="icon" href="../../../static/instance/images/favicon.png" type="image/png">
        
        </head>
        <body>
            <div class="divfimg">
                <a href="{{ url_for('main') }}" class="fimg">
                    <img src="{{ url_for('static', filename='instance/images/logo.png') }}" alt="Logo">
                </a>
                <div class="form-container">
                    <h2>Reset Password</h2>
                    <hr>
                    
                    <!-- Flash messages section -->
                    {% with messages = get_flashed_messages(with_categories=true) %}
                        {% if messages %}
                            {% for category, message in messages %}
                                <div class="flash-message {{ category }}">{{ message }}</div>
                            {% endfor %}
                        {% endif %}
                    {% endwith %}
                    
                    <form method="post">
                        <label for="password">New Password<span class="star">*</span></label>
                        <input type="password" id="password" name="password" required>
                        <label for="confirm_password">Confirm Password<span class="star">*</span></label>
                        <input type="password" id="confirm_password" name="confirm_password" required>
                        <button type="submit">Submit</button>
                    </form>
                </div>
            </div>
        </body>
        </html>
        `,
        "base_logged_in.html": `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>{% block title %}Image Classification{% endblock %}</title>
            <link rel="stylesheet" href="{{ url_for('static', filename='css/logged_in_styles.css') }}">
            <link rel="icon" href="../static/instance/images/favicon.png" type="image/png">
        
        </head>
        <body>
            <nav>
                <div class="container">
                    <a href="{{ url_for('main') }}" class="logo">
                        <img src="{{ url_for('static', filename='instance/images/logo.png') }}" alt="Logo">
                    </a>
                    <div class="nav-links">
                        <a href="{{ url_for('image_classification') }}" class="home">Classify</a>
                        <a href="{{ url_for('about_project') }}">About Project</a>
                        <a href="{{ url_for('group_members') }}">Group Members</a>
                        <a href="{{ url_for('dashboard') }}">Dashboard</a>
                        <a href="{{ url_for('logout') }}">Logout</a>
                    </div>
                </div>
            </nav>
            <div class="content container">
                {% with messages = get_flashed_messages(with_categories=True) %}
                    {% if messages %}
                        {% for category, message in messages %}
                            <div class="flash-{{ category }}">{{ message }}</div>
                        {% endfor %}
                    {% endif %}
                {% endwith %}
                {% block content %}{% endblock %}
            </div>
            <footer>
                <hr>
                <p>SHAOL TECH | Kazi Nur Ali</p>
            </footer>
        </body>
        </html>
        `,
        "logged_in_base.html": `
        {% extends 'base_logged_in.html' %}
        {% block title %}Home{% endblock %}
        
        {% block content %}
        <link rel="stylesheet" href="{{ url_for('static', filename='css/custom_logged_in_styles.css') }}">
        
        <div class="center-content">
            <h1 class="welcome">Welcome, {{ current_user.username }}</h1>
            <p class="subtext">to Image Classification</p>
            <p class="description">Explore the functionalities available for you.</p>
            <a href="{{ url_for('image_classification') }}" class="classify-button">Classify Your Image</a>
        </div>
        {% endblock %}
        `,
        "image_classification.html": `
        {% extends "base_logged_in.html" %}
        {% block title %}Classify Image{% endblock %}
        {% block content %}
        <main>
            <h1>Classify Your Image</h1>
            <p>Identify objects in your image by using our Image Classifier.</p>
            <p>Vary the detection confidence and Shows best result with JPG, JPEG, PNG files and close-range images.</p>
            <div class="upload-container" id="upload-container">
                <img src="https://img.icons8.com/ios-glyphs/100/000000/camera.png" alt="Upload Icon">
                <p class="">Drop an image here<br><br>or<br><br>Click to browse</p>
            </div>
            <form id="upload-form" method="post" action="/success" enctype="multipart/form-data" class="hidden">
                <input type="file" id="file" name="file" accept="image/*">
            </form>
            <br>
            <form method="post" action="/success">
                <label for="link">Image URL:</label>
                <input type="text" id="link" name="link" class="url-input">
                <input type="submit" value="Classify" class="upload-button">
            </form>
            {% if error %}
            <p class="error">{{ error }}</p>
            {% endif %}
        </main>
        <style>
            main {
                font-family: Arial, sans-serif;
                text-align: center;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }
        
            h1 {
                font-size: 36px;
                margin-top: 10px;
            }
        
            .upload-container {
                border: 5px dashed #ccc;
                border-radius: 10px;
                padding: 40px;
                width: 500px;
                height: 250px;
                margin: 0 auto;
                cursor: pointer;
                background-color: #EEEEEE;
                position: relative;
            }
        
            .upload-container:hover {
                background-color: #f9f9f9;
            }
        
            .upload-container img {
                margin-top: -10px;
                width: 150px;
                height: 150px;
            }
        
            .upload-container p {
                margin-top: -10px;
                font-size: 20px;
            }
        
            .hidden {
                display: none;
            }
        
            label {
                font-size: 16px;
            }
        
            .url-input {
                padding: 4px;
                width: 250px;
                margin: 5px;
                border-radius: 5px;
                border: 1px solid #ccc;
                font-size: 16px;
            }
        
            .upload-button {
                padding: 5px 20px;
                background-color: #3f9441;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                font-weight: 500;
            }
        
            .upload-button:hover {
                background-color: #45a049;
            }
        
            .error {
                color: red;
            }
        </style>
        <script>
            const uploadContainer = document.getElementById('upload-container');
            const fileInput = document.getElementById('file');
            const uploadForm = document.getElementById('upload-form');
        
            uploadContainer.addEventListener('click', () => fileInput.click());
            uploadContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadContainer.style.backgroundColor = '#f1f1f1';
            });
            uploadContainer.addEventListener('dragleave', () => {
                uploadContainer.style.backgroundColor = '#EEEEEE';
            });
            uploadContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                fileInput.files = e.dataTransfer.files;
                uploadForm.submit();
            });
            fileInput.addEventListener('change', () => uploadForm.submit());
        </script>
        {% endblock %}
        `,
        "success.html": `
        {% extends "base_logged_in.html" %}
        {% block title %}Success{% endblock %}
        {% block content %}
        <h2 class="title">Classification Results</h2>
        <div class="result-container">
            <div class="image-container">
                <img src="{{ url_for('static', filename='images/' ~ img) }}" class="uploaded-image">
            </div>
            <div class="table-container">
                <table class="result-table">
                    <tr>
                        <th>Class</th>
                        <th>Probability</th>
                    </tr>
                    <tr>
                        <td>{{ predictions.class1 | replace("_", " ") | title }}</td>
                        <td>{{ predictions.prob1 }}%</td>
                    </tr>
                    <tr>
                        <td>{{ predictions.class2 | replace("_", " ") | title }}</td>
                        <td>{{ predictions.prob2 }}%</td>
                    </tr>
                    <tr>
                        <td>{{ predictions.class3 | replace("_", " ") | title }}</td>
                        <td>{{ predictions.prob3 }}%</td>
                    </tr>
                </table>
                <div class="action-buttons">
                    <button onclick="redirectToImageClassification()">Try With Another Image</button>
                </div>
            </div>
        </div>
        <script>
            function redirectToImageClassification() {
                window.location.href = "{{ url_for('image_classification') }}";
            }
        </script>
        <style>
            .title {
                text-align: center;
                font-size: 36px;
                margin: 50px 0; /* Increased margin for more space */
            }
        
            .result-container {
                display: grid;
                grid-template-columns: auto auto;
                gap: 100px;
                justify-content: center;
                align-items: start;
                margin-top: 20px;
                max-width: 1200px;
                margin: 0 auto;
            }
        
            .image-container {
                display: flex;
                justify-content: center;
                align-items: center;
            }
        
            .uploaded-image {
                border: 1px solid #ccc;
                border-radius: 10px;
                max-width: 300px;
                height: auto;
            }
        
            .table-container {
                display: flex;
                flex-direction: column;
                align-items: center; /* Center the table and button */
            }
        
            .result-table {
                width: 700px; /* Set a fixed width for the table */
                border-collapse: collapse;
                background-color: white;
                margin-bottom: 20px;
            }
        
            .result-table th,
            .result-table td {
                border: 1px solid #ccc;
                padding: 10px;
                text-align: center;
                color: black;
                width: 50%; /* Make both columns take up 50% of the table width */
            }
        
            .result-table th {
                background-color: #f2f2f2;
            }
        
            .action-buttons {
                text-align: center;
                width: 100%; /* Make the button container take the full width */
            }
        
            .action-buttons button {
                padding: 10px 20px;
                background-color: #3f9441;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 10px;
                font-size: 18px;
            }
        
            .action-buttons button:hover {
                background-color: #45a049;
            }
        </style>
        {% endblock %}
        `,
        "about_project.html": `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>About Project</title>
            <link rel="stylesheet" href="../static/css/about_project_styles.css">
            <link rel="icon" href="../static/instance/images/favicon.png" type="image/png">
        </head>
        <body>
            <div class="banner">
                <nav class="navbar">
                    <div class="container">
                        <a href="{{ url_for('main') }}" class="logo">
                            <img src="../static/instance/images/logo.png" alt="Logo">
                        </a>
                        <div class="nav-links">
                            <a href="{{ url_for('image_classification') }}" class="home">Classify</a>
                            <a href="{{ url_for('about_project') }}">About Project</a>
                            <a href="{{ url_for('group_members') }}">Group Members</a>
                            <a href="{{ url_for('dashboard') }}">Dashboard</a>
                            <a href="{{ url_for('logout') }}">Logout</a>
                        </div>
                    </div>
                </nav>
                <div class="content-container">
                    <div class="left-content">
                        <h1 class="title">About This <span class="highlight">Image</span><br><span class="highlight">Classification</span> Project</h1>
                        <p class="description">Discover the features, technologies, and workings behind our advanced image classification project.</p>
                        <div class="button-container">
                            <a href="{{ url_for('image_classification') }}" class="classify-button">Classify Image ➔</a>
                        </div>
                    </div>
                    <div class="right-content">
                        <img src="../static/instance/images/banner-image.png" alt="Banner Image">
                    </div>
                </div>
            </div>
        
            <div class="options-container">
                <div class="option" data-target="overview">Project Overview</div>
                <div class="option" data-target="features">Features</div>
                <div class="option" data-target="technologies">Technologies Used</div>
                <div class="option" data-target="how-it-works">How It Works</div>
            </div>
        
            <div class="content-section" id="overview">
                <div class="left-image">
                    <img src="../static/instance/images/overview-image.png" alt="Overview Image">
                </div>
                <div class="right-details">
                    <h2>Project Overview</h2>
                    <p>
                        This project aims to provide a web-based image classification tool leveraging deep learning. Users can
                        upload images or provide URLs, and our model will classify the images into categories such as 'angry',
                        'crying', 'fighting_dog', 'happy', 'male', 'female', 'running_dog', and 'sitting_dog'.
                    </p>
                </div>
            </div>
        
            <div class="content-section" id="features">
                <div class="left-image">
                    <img src="../static/instance/images/features-image.png" alt="Features Image">
                </div>
                <div class="right-details">
                    <h2>Features</h2>
                    <ul>
                        <li>User registration and email verification</li>
                        <li>Password reset functionality</li>
                        <li>Image classification with top-3 predictions</li>
                        <li>User profile management</li>
                        <li>Search history with filters and pagination</li>
                        <li>Secure authentication and session management</li>
                        <li>Responsive and user-friendly interface</li>
                    </ul>
                </div>
            </div>
        
            <div class="content-section" id="technologies">
                <div class="left-image">
                    <img src="../static/instance/images/technologies-image.png" alt="Technologies Image">
                </div>
                <div class="right-details">
                    <h2>Technologies Used</h2>
                    <ul>
                        <li><strong>Flask:</strong> Web framework for Python</li>
                        <li><strong>MySQL:</strong> Database management system</li>
                        <li><strong>TensorFlow:</strong> Machine learning framework for image classification</li>
                        <li><strong>Flask-Mail:</strong> Library for sending emails</li>
                        <li><strong>Flask-Login:</strong> User session management</li>
                        <li><strong>Bootstrap:</strong> Front-end component library for responsive design</li>
                    </ul>
                </div>
            </div>
        
            <div class="content-section" id="how-it-works">
                <div class="left-image">
                    <img src="../static/instance/images/how-it-works-image.png" alt="How It Works Image">
                </div>
                <div class="right-details">
                    <h2>How It Works</h2>
                    <ol>
                        <li>Users upload an image or provide an image URL.</li>
                        <li>The image is preprocessed to match the input format required by the CNN model.</li>
                        <li>The preprocessed image is fed into the model, which predicts the class probabilities.</li>
                        <li>The top three predictions are displayed to the user along with their probabilities.</li>
                    </ol>
                </div>
            </div>
        
            <div class="project-materials">
                <h2>Project Materials</h2>
                <div class="material-grid">
                    <a href="{{ url_for('codes') }}" class="material">
                        <img src="../static/instance/images/codes.png" alt="Material 1">
                        <div class="overlay">
                            <div class="initial-text">Source Code</div>
                            <div class="hover-text">View All Codes</div>
                        </div>
                    </a>
                    <a href="{{ url_for('presentation') }}" class="material">
                        <img src="../static/instance/images/presentation.png" alt="Material 2">
                        <div class="overlay">
                            <div class="initial-text">Presentation</div>
                            <div class="hover-text">View Slide</div>
                        </div>
                    </a>
                    <a href="{{ url_for('report') }}" class="material">
                        <img src="../static/instance/images/report.png" alt="Material 3">
                        <div class="overlay">
                            <div class="initial-text">Project Report</div>
                            <div class="hover-text">View Project Report</div>
                        </div>
                    </a>
                </div>
            </div>
        
            <footer>
                <hr>
                <p>SHAOL TECH | Kazi Nur Ali</p>
            </footer>
            <script src="../static/js/about_project_scripts.js"></script>
        </body>
        </html>        
        `,
        "codes.html": `
        
        `,
        "presentation.html": `
        
        `,
        "report.html": `
{% extends "base_logged_in.html" %}

{% block title %}Report{% endblock %}

{% block content %}
    <style>
        /* Ensure the container takes full viewport height minus header and footer */
        .button-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh; /* Adjust height considering the header and footer */
            text-align: center;
            padding: 20px;
        }
        .button-container button, .button-container a {
            height: 70px; /* Set button height */
            width: 400px; /* Ensure both buttons have the same width */
            margin: 10px 0;
            font-size: 18px;
            line-height: 70px; /* Set line-height to match button height for vertical alignment */
            color: #fff;
            border: none;
            border-radius: 5px;
            text-decoration: none;
            text-align: center;
            cursor: pointer;
            display: inline-block; /* Ensures buttons take the full width defined */
            font-weight: bold;
        }
        .view-button {
            background-color: #ffa500; /* Orange */
        }
        .view-button:hover {
            background-color: #cc8400;
        }
        .download-button {
            background-color: #007bff; /* Blue */
        }
        .download-button:hover {
            background-color: #0056b3;
        }
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        .pdf-container {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            width: 80%;
            height: 80%;
        }
        .pdf-container iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .close-button {
            background-color: #ff0000; /* Red */
            color: #fff;
            border: none;
            padding: 10px 20px;
            cursor: pointer;
            border-radius: 5px;
            font-size: 16px;
            position: absolute;
            top: 20px;
            right: 20px;
        }
    </style>
    <div class="button-container">
        <button class="view-button" onclick="showPDF()">View Project Report</button>
        <a href="../static/instance/files/project-report.pdf" download="Project_Report.pdf" class="download-button">Download Project Report</a>
    </div>
    <div class="overlay" id="overlay">
        <div class="pdf-container">
            <iframe src="../static/instance/files/project-report.pdf"></iframe>
        </div>
        <button class="close-button" onclick="closePDF()">Close</button>
    </div>

    <script>
        function showPDF() {
            document.getElementById('overlay').style.display = 'flex';
        }

        function closePDF() {
            document.getElementById('overlay').style.display = 'none';
        }
    </script>
{% endblock %}
        `,
        "group_members.html": `
        {% extends "base_logged_in.html" %}

        {% block title %}Meet our team{% endblock %}
        
        {% block content %}
        <link rel="stylesheet" href="{{ url_for('static', filename='css/group_members.css') }}">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        
        <div class="team-container">
            <h1 class="title">Meet our team</h1>
            <div class="card-container">
                <!-- Member 1 -->
                <div class="card">
                    <img src="{{ url_for('static', filename='instance/images/1.jpg') }}" alt="Member 1">
                    <div class="card-content">
                        <h2 class="name">Kazi Nur Ali</h2>
                        <p class="id">ID: 213002130</p>
                        <p class="department">B.Sc in CSE</p>
                        <p class="university">Green University of Bangladesh</p>
                        <hr>
                        <div class="social-icons">
                            <a href="https://www.facebook.com/kazikazol10" target="_blank"><i class="fa fa-facebook"></i></a>
                            <a href="https://x.com/kazikazol10" target="_blank"><i class="fa fa-twitter"></i></a>
                            <a href="https://www.instagram.com/kazikazol10/" target="_blank"><i class="fa fa-instagram"></i></a>
                        </div>
                    </div>
                    <div class="card-hover-content">
                        <img src="{{ url_for('static', filename='instance/images/1.jpg') }}" alt="Member 1">
                        <div class="hover-content">
                            <h2 class="name">Kazi Nur Ali</h2>
                            <p class="id">ID: 213002130</p>
                            <p class="department">B.Sc in CSE</p>
                            <p class="university">Green University of Bangladesh</p>
                            <p class="description">Lorem ipsum dolor sit, amet consectetur adipisicing elit. Commodi cumque,
                                sequi fugiat perspiciatis eius tempora error soluta magni quis. Omnis culpa obcaecati aspernatur
                                id fuga aliquid adipisci nulla ex illo.</p>
                            <hr>
                            <div class="social-icons">
                                <a href="https://www.facebook.com/kazikazol10" target="_blank"><i class="fa fa-facebook"></i></a>
                                <a href="https://x.com/kazikazol10" target="_blank"><i class="fa fa-twitter"></i></a>
                                <a href="https://www.instagram.com/kazikazol10/" target="_blank"><i class="fa fa-instagram"></i></a>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Member 2 -->
                <div class="card">
                    <img src="{{ url_for('static', filename='instance/images/2.jpg') }}" alt="Member 2">
                    <div class="card-content">
                        <h2 class="name">Mehedi Hasan Lemon</h2>
                        <p class="id">213002107</p>
                        <p class="department">B.Sc in CSE</p>
                        <p class="university">Green University of Bangladesh</p>
                        <hr>
                        <div class="social-icons">
                            <a href="#" target="_blank"><i class="fa fa-facebook"></i></a>
                            <a href="#" target="_blank"><i class="fa fa-twitter"></i></a>
                            <a href="#" target="_blank"><i class="fa fa-instagram"></i></a>
                        </div>
                    </div>
                    <div class="card-hover-content">
                        <img src="{{ url_for('static', filename='instance/images/2.jpg') }}" alt="Member 2">
                        <div class="hover-content">
                            <h2 class="name">Mehedi Hasan Lemon</h2>
                            <p class="id">213002107</p>
                            <p class="department">B.Sc in CSE</p>
                            <p class="university">Green University of Bangladesh</p>
                            <p class="description">Lorem ipsum dolor, korem100 Lorem ipsum dolor sit amet consectetur adipisicing elit. Eum sapiente accusantium iusto. Dignissimos perspiciatis laboriosam culpa tempora voluptate, blanditiis natus minima, in esse illo ullam dolorum excepturi non consequuntur architecto expedita omnis repellat vitae quasi ipsum ex aspernatur. Est labore sint placeat atque porro, laborum vitae modi? Maiores quod debitis aliquid optio veritatis deleniti sed, aspernatur autem molestiae minus ea error similique, omnis obcaecati placeat porro necessitatibus quam eaque dicta. Doloremque qui tenetur impedit ut amet optio aliquid? Minus a fugiat, veniam, animi nam tempore repellendus reprehenderit aliquid libero aperiam labore corporis neque! Totam aspernatur rem soluta, quibusdam impedit est.</p>
                            <hr>
                            <div class="social-icons">
                                <a href="#" target="_blank"><i class="fa fa-facebook"></i></a>
                                <a href="#" target="_blank"><i class="fa fa-twitter"></i></a>
                                <a href="#" target="_blank"><i class="fa fa-instagram"></i></a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {% endblock %}
        `,
        "dashboard.html": `
        {% extends "base_logged_in.html" %}
        {% block title %}Dashboard{% endblock %}
        {% block content %}
        <link rel="stylesheet" href="{{ url_for('static', filename='css/dashboard.css') }}">
        
        <div class="main-container">
            <div class="welcome-message">
                <h3>Welcome to your dashboard, {{ current_user.username }}</h3>
            </div>
        
            <div class="dashboard-container">
                <div class="sidebar">
                    <ul>
                        <li class="{% if request.endpoint == 'profile' %}active{% endif %}">
                            <a href="{{ url_for('profile') }}">Profile</a>
                            <hr>
                        </li>
                        <li class="{% if request.endpoint == 'history' %}active{% endif %}">
                            <a href="{{ url_for('history') }}">Search History</a>
                            <hr>
                        </li>
                    </ul>
                </div>
                <div class="dashboard-content">
                    {% block dashboard_content %}{% endblock %}
                </div>
            </div>
        </div>
        {% endblock %}        
        `,
        "profile.html": `{% extends "dashboard.html" %}
        {% block title %}Profile{% endblock %}
        {% block dashboard_content %}
        <style>
            .profile-container {
                padding: 0 50px 50px 50px;
            }
        
            .profile-container h2 {
                font-size: 24px;
                margin-bottom: 10px;
            }
        
            .profile-container hr {
                margin: 20px 0;
            }
        
            .profile-container .form-group {
                display: flex;
                align-items: center;
                margin-bottom: 10px; /* Reduced margin-bottom for less gap */
            }
        
            .profile-container label {
                flex: 1;
                color: gray;
                font-weight: bold;
                margin-right: 5px; /* Reduced margin-right for less gap */
            }
        
            .profile-container input[type="text"],
            .profile-container input[type="email"],
            .profile-container input[type="password"] {
                flex: 2;
                padding: 8px;
                border-radius: 5px;
                border: 1px solid #ccc;
                background-color: #f7f7f7;
                box-sizing: border-box;
                width: 60%; /* Reduced width */
            }
        
            .profile-container input[readonly] {
                background-color: #dcdcdc;
                color: #888;
            }
        
            .profile-container .btn {
                display: inline-block;
                padding: 10px 20px;
                font-size: 16px;
                cursor: pointer;
                background-color: #007bff;
                color: #fff;
                border: none;
                border-radius: 4px;
                text-align: center;
            }
        
            .profile-container .btn:hover {
                background-color: #0056b3;
            }
        
            .flash-messages {
                text-align: center;
                margin-bottom: 20px;
            }
        
            .flash-success {
                color: green;
            }
        
            .flash-danger {
                color: red;
            }
        
            .password-change {
                margin-top: 20px;
            }
        
            .password-change label {
                margin-left: 5px;
            }
        
            #change-password-form.hidden {
                display: none;
            }
        </style>
        
        <div class="profile-container">
            <h2>Profile</h2>
            <hr>
            {% with messages = get_flashed_messages(with_categories=true) %}
                {% if messages %}
                    <div class="flash-messages">
                        {% for category, message in messages %}
                            <div class="flash-{{ category }}">{{ message }}</div>
                        {% endfor %}
                    </div>
                {% endif %}
            {% endwith %}
            <form method="post" action="{{ url_for('profile') }}">
                <div class="form-group">
                    <label for="username">Username:</label>
                    <input type="text" name="username" value="{{ user.username }}" readonly>
                </div>
                <div class="form-group">
                    <label for="first_name">First Name:</label>
                    <input type="text" name="first_name" value="{{ user.first_name }}" required>
                </div>
                <div class="form-group">
                    <label for="last_name">Last Name:</label>
                    <input type="text" name="last_name" value="{{ user.last_name }}" required>
                </div>
                <div class="form-group">
                    <label for="email">Email:</label>
                    <input type="email" name="email" value="{{ user.email }}" required>
                </div>
                <button type="submit" class="btn">Update Profile</button>
            </form>
        </div>
        {% endblock %}        
        `,
        "history.html": `
        {% extends "dashboard.html" %}
        {% block title %}History{% endblock %}
        {% block dashboard_content %}
        <style>
            .history-container {
                padding: 0 50px 50px 50px;
            }
        
            .history-container h2 {
                font-size: 24px;
                margin-bottom: 10px;
            }
        
            .history-container hr {
                margin: 20px 0;
            }
        
            .sort-options {
                float: right;
                margin-bottom: 20px;
            }
        
            .sort-options select {
                padding: 5px;
                font-size: 16px;
            }
        
            .history-table {
                width: 100%;
                border-collapse: collapse;
            }
            .history-table, .history-table th, .history-table td {
                border: 1px solid black;
            }
            .history-table th, .history-table td {
                padding: 10px;
                text-align: center;
            }
            .history-table th {
                text-align: center;
            }
            .history-table tr:nth-child(even) {
                background-color: #f2f2f2;
            }
            .history-table tr:nth-child(odd) {
                background-color: #ffffff;
            }
            .history-table td img {
                width: 100px;
                height: 100px;
                object-fit: contain;
                display: block;
                margin-left: auto;
                margin-right: auto;
            }
            .history-table .date-time {
                text-align: center;
                line-height: 2; /* Adjusts the line height for spacing */
            }
            .history-table .date-time .date,
            .history-table .date-time .time {
                display: block;
            }
            .history-table .results {
                text-align: left;
                padding-left: 50px;
                line-height: 2; /* Adjusts the line height for spacing */
            }
            .pagination {
                margin-top: 20px;
                text-align: center;
            }
            .pagination a {
                margin: 0 5px;
                padding: 5px 10px;
                text-decoration: none;
                border: 1px solid #000;
                color: #000;
            }
            .pagination a.active {
                background-color: #000;
                color: #fff;
            }
            .pagination a.disabled {
                pointer-events: none;
                color: #ccc;
                border-color: #ccc;
            }
        </style>
        
        <div class="history-container">
            <h2>Search History</h2>
            <hr>
            <div class="sort-options">
                <form method="get" action="{{ url_for('history') }}">
                    <label for="class">Sort by Class:</label>
                    <select name="class" id="class" onchange="this.form.submit()">
                        <option value="">Select Class</option>
                        {% for class_name in class_options %}
                            <option value="{{ class_name }}" {% if class_name == selected_class %}selected{% endif %}>
                                {{ class_name.replace('_', ' ').title() }}
                            </option>
                        {% endfor %}
                    </select>
                </form>
            </div>
            <table class="history-table">
                <tr>
                    <th style="width: 150px;">Image</th>
                    <th>Result</th>
                    <th style="width: 150px;">Date and Time</th>
                </tr>
                {% for entry in history %}
                <tr>
                    <td><img src="{{ url_for('static', filename='images/' ~ entry[0]) }}" alt="History Image"></td>
                    <td class="results">
                        {% set results = entry[1] %}
                        {% for i in range(1, 4) %}
                            {{ results['class' + i|string] | replace('_', ' ') | title }}: {{ results['prob' + i|string] }}%
                            {% if not loop.last %}<br>{% endif %}
                        {% endfor %}
                    </td>
                    <td class="date-time">
                        <span class="date">{{ entry[2].strftime('%B %d, %Y') }}</span>
                        <span class="time">{{ entry[2].strftime('%I:%M %p') }}</span>
                    </td>
                </tr>
                {% endfor %}
            </table>
            <div class="pagination">
                <a href="{{ url_for('history', page=1, class=selected_class) }}" class="{{ 'disabled' if current_page == 1 else '' }}">First</a>
                <a href="{{ url_for('history', page=current_page - 1, class=selected_class) }}" class="{{ 'disabled' if current_page == 1 else '' }}">«</a>
        
                {% if pagination_range.start > 1 %}
                    <span>...</span>
                {% endif %}
                
                {% for page_num in pagination_range %}
                    <a href="{{ url_for('history', page=page_num, class=selected_class) }}" class="{% if page_num == current_page %}active{% endif %}">{{ page_num }}</a>
                {% endfor %}
                
                {% if pagination_range.stop - 1 < total_pages %}
                    <span>...</span>
                {% endif %}
                
                <a href="{{ url_for('history', page=current_page + 1, class=selected_class) }}" class="{{ 'disabled' if current_page == total_pages else '' }}">»</a>
                <a href="{{ url_for('history', page=total_pages, class=selected_class) }}" class="{{ 'disabled' if current_page == total_pages else '' }}">Last</a>
            </div>
        </div>
        {% endblock %}        
        `,
        "styles.css": `
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: url('../instance/images/background.png') no-repeat center center fixed;
            background-size: cover;
            color: #fff;
            height: 100vh;
        }
        
        .background {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: 100%;
        }
        
        nav {
            background: rgba(0, 0, 0, 0.5);
            height: 100px;
            display: flex;
            align-items: center;
            padding: 0 20px;
        }
        
        nav .container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
        }
        
        nav .logo img {
            height: 80px;
        }
        
        nav .nav-links {
            display: flex;
            gap: 20px;
            align-items: center;
            margin-right: 20px;
        }
        
        nav .nav-links a {
            color: #fff;
            text-decoration: none;
            font-weight: bold;
            font-size: 18px;
        }
        
        nav .nav-links .login-link {
            color: #fff;
        }
        
        nav .nav-links .login-link:hover {
            color: #1DBF75;
        }
        
        nav .nav-links .register-link {
            color: #1DBF75;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 5px;
            border: 2px solid #1DBF75;
        }
        
        nav .nav-links .register-link:hover {
            background-color: #1DBF75;
            color: #fff;
        }
        
        .content {
            display: flex;
            justify-content: flex-start;
            align-items: center;
            height: calc(100% - 100px);
            text-align: left;
            padding-left: 10%;
        }
        
        .center-content {
            width: 50%;
        }
        
        .center-content .welcome {
            font-size: 64px;
            margin: 0;
            font-weight: bold;
        }
        
        .center-content .subtext {
            font-size: 48px;
            margin: 0;
            font-weight: bold;
        }
        
        .center-content .description {
            font-size: 24px;
            margin: 20px 0;
        }
        
        .center-content .buttons {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            gap: 20px;
        }
        
        .center-content .buttons .login-button, 
        .center-content .buttons .register-button {
            display: inline-block;
            padding: 15px 30px;
            margin: 10px 0;
            font-size: 20px;
            text-decoration: none;
            font-weight: bold;
            width: 45%;
            text-align: center;
            border-radius: 5px;
        }
        
        .center-content .buttons .login-button {
            background-color: #fff;
            color: #1DBF75;
        }
        
        .center-content .buttons .login-button:hover {
            background-color: #dddddd;
            color: #1DBF75;
        }
        
        .center-content .buttons .register-button {
            background-color: #1DBF75;
            color: #fff;
        }
        
        .center-content .buttons .register-button:hover {
            background-color: #1f915e;
            color: #fff;
        }
        
        footer {
            background: rgba(0, 0, 0, 0.5);
            padding: 10px 0;
            text-align: center;
        }
        `,
        "login-register-style.css": `
        body {
            font-family: Arial, sans-serif;
            background-color: #f7f7f7;
            display: flex;
            justify-content: center;
            align-items: flex-start; /* Align items at the start */
            min-height: 100vh;
            margin: 0;
        }
        
        .divfimg {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            padding-top: 20px; /* Add padding to ensure content is not cut off at the top */
        }
        
        .form-container {
            background-color: #ffffff;
            padding: 20px 40px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            width: 450px;
            box-sizing: border-box;
            text-align: center;
            margin-top: 20px; /* Add margin-top to space it from the logo */
        }
        
        .fimg img {
            width: 350px;
        }
        
        .star{
            color: red;
            
        }
        
        h2 {
            margin-bottom: 10px;
            font-size: 24px;
            color: #333333;
            text-align: left;
            width: 100%;
        }
        
        hr {
            border: none;
            height: 1px;
            background-color: #ddd;
            margin-bottom: 20px;
            width: 100%;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #555555;
            text-align: left;
            width: 100%;
        }
        
        input[type="text"],
        input[type="email"],
        input[type="password"] {
            width: 100%;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #dddddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        
        button {
            width: 100%;
            padding: 10px;
            background-color: #6c63ff;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.3s ease;
            margin-top: 10px;
        }
        
        button:hover {
            background-color: #5a54e5;
        }
        
        p {
            margin-top: 20px;
            color: #777777;
            text-align: left;
            width: 100%;
        }
        
        a {
            color: #6c63ff;
            text-decoration: none;
            font-weight: bold;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        .error-message {
            background-color: #ffdddd;
            color: #ff0000;
            padding: 10px;
            margin-bottom: 15px;
            border: 1px solid #ff0000;
            border-radius: 4px;
            text-align: center;
        }
        
        .flash-message {
            padding: 10px;
            margin-bottom: 15px;
            border-radius: 4px;
            text-align: center;
            width: 100%;
        }
        
        .flash-message.danger {
            background-color: #ffdddd;
            color: #ff0000;
            border: 1px solid #ff0000;
        }
        
        .flash-message.success {
            background-color: #ddffdd;
            color: #008000;
            border: 1px solid #008000;
        }
        
        .logreg-container {
            display: flex;
            justify-content: center;
            margin-top: 20px;
        }
        
        .logreg {
            background-color: #119f16;
            width: 50%;
            height: 50px;
            display: flex;
            justify-content: center;
            align-items: center;
            margin-top: 0;
            margin-bottom: 10px;
        }
        
        .logreg a {
            color: white;
            text-decoration: none;
            width: 100%;
            text-align: center;
            line-height: 50px; /* Center text vertically */
        }
        
        .logreg:hover {
            background-color: #0c9111;
        }        
        `,
        "logged_in_styles.css": `
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            font-family: Arial, sans-serif;
        }
        
        .content {
            flex: 1;
        }
        
        nav {
            height: 100px;
            display: flex;
            align-items: center;
            padding: 0 20px;
            background-color: #f8f9fa; /* Example background color */
        }
        
        nav .container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
        }
        
        nav .logo img {
            height: 80px;
        }
        
        nav .nav-links {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        
        nav .nav-links a {
            color: #343a40; /* Darker color */
            text-decoration: none;
            font-weight: 600; /* Semi-bold */
            font-size: 18px;
            transition: color 0.3s ease;
        }
        
        nav .nav-links a.home {
            color: #000;
            font-weight: bold; /* Bold */
        }
        
        nav .nav-links a:hover {
            color: #1DBF75; /* Hover color */
        }
        
        footer {
            padding: 20px 0;
            text-align: center;
            color: #6c757d;
            font-weight: 300; /* Thin font weight */
        }
        
        footer p {
            margin: 0;
            margin-bottom: 10px;
        }
        
        hr {
            border: none;
            height: 1px;
            background-color: #afafaf;
            margin: 30px 0;
            width: 100%;
        }        
        `,
        "custom_logged_in_styles.css": `
        body {
            background: url('../instance/images/background.png') no-repeat center center fixed;
            background-size: cover;
            color: white;
        }
        
        nav {
            background: rgba(0, 0, 0, 0.5);
        }
        
        nav .logo img {
            content: url('../instance/images/logo-01.png'); /* Override logo image */
            height: 80px;
        }
        
        nav .nav-links a {
            color: #fff; /* Menus color white */
            text-decoration: none;
            font-weight: 600; /* Semi-bold */
            font-size: 18px;
            transition: color 0.3s ease;
        }
        
        nav .nav-links a.home {
            color: #fff; /* Default color white */
            font-weight: bold; /* Bold */
        }
        
        nav .nav-links a:hover {
            color: #1DBF75; /* Hover color */
        }
        
        footer {
            background: rgba(0, 0, 0, 0.5);
            color: #fff; /* White color for footer text */
            font-weight: 300; /* Thin font weight */
            text-align: center;
            padding: 20px 0;
        }
        
        footer p {
            margin: 0;
        }
        
        hr {
            display: none; /* Remove the <hr> from footer */
        }
        
        .content {
            display: flex;
            justify-content: flex-start;
            align-items: center;
            height: calc(100% - 100px);
            text-align: left;
            padding-left: 10%;
        }
        
        .center-content {
            width: 50%;
        }
        
        .center-content .welcome {
            font-size: 64px;
            margin: 0;
            font-weight: bold;
        }
        
        .center-content .subtext {
            font-size: 48px;
            margin: 0;
            font-weight: bold;
        }
        
        .center-content .description {
            font-size: 24px;
            margin: 20px 0;
        }
        
        .center-content .classify-button {
            display: inline-block;
            padding: 15px 30px;
            font-size: 20px;
            text-decoration: none;
            font-weight: bold;
            background-color: #1DBF75;
            color: #fff;
            border-radius: 5px;
            margin-top: 20px;
        }
        
        .center-content .classify-button:hover {
            background-color: #1f915e;
        }
        `,
        "about_project_styles.css": `
        html, body {
            height: 100%;
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
        }
        
        /* General styles */
        .banner {
            position: relative;
            min-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            background: url('../instance/images/Banner-bg.png') no-repeat top right;
            background-size: 60% 100%;
        }
        
        .navbar {
            height: 100px;
            display: flex;
            align-items: center;
            padding: 0 20px;
            background: none;
            z-index: 10;
        }
        
        .navbar .container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
        }
        
        .navbar .logo img {
            height: 80px;
        }
        
        .navbar .nav-links {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        
        .navbar .nav-links a {
            color: #fff;
            text-decoration: none;
            font-weight: 600;
            font-size: 18px;
            transition: color 0.3s ease;
        }
        
        .navbar .nav-links a.home {
            color: #fff;
            font-weight: bold;
        }
        
        .navbar .nav-links a:hover {
            color: #1DBF75;
        }
        
        .content-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 5%;
            box-sizing: border-box;
            z-index: 1;
        }
        
        .left-content {
            width: 60%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-height: 60vh;
        }
        
        .left-content .title {
            font-size: 48px;
            margin: 0;
            font-weight: bold;
        }
        
        .left-content .highlight {
            color: #FBB271;
        }
        
        .left-content .description {
            font-size: 24px;
            margin: 20px 0;
            color: #444444;
        }
        
        .classify-button {
            display: inline-block;
            font-size: 20px;
            text-decoration: none;
            font-weight: bold;
            color: black;
            cursor: pointer;
            transition: transform 0.5s ease;
            margin-top: 10px;
        }
        
        .classify-button:hover {
            transform: translateX(20px);
        }
        
        .right-content {
            width: 40%;
            text-align: right;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .right-content img {
            max-width: 400px;
            height: auto;
        }
        
        .options-container {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 50px 0;
            gap: 40px;
            background: #f8f9fa;
        }
        
        .option {
            font-size: 20px;
            font-weight: 600;
            color: #5c5c5c;
            cursor: pointer;
            transition: color 0.3s ease, border-bottom 0.3s ease;
            position: relative;
        }
        
        .option::after {
            content: '';
            position: absolute;
            left: 0;
            bottom: -5px;
            height: 2px;
            width: 0;
            background-color: #FBB271; /* Same color as the highlight */
            transition: width 0.3s ease;
        }
        
        .option:hover::after {
            width: 100%;
        }
        
        .option.active::after {
            width: 100%;
        }
        
        .option.active {
            color: #343a40;
            font-weight: bold;
        }
        
        .content-section {
            display: none;
            flex-direction: row;
            justify-content: space-between;
            align-items: flex-start;
            padding: 50px 5%;
            box-sizing: border-box;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            margin-bottom: 20px;
        }
        
        .content-section.active {
            display: flex;
        }
        
        .left-image img {
            max-width: 400px;
            height: auto;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        
        .right-details {
            width: 60%;
            padding-left: 20px;
        }
        
        .right-details h2 {
            font-size: 36px;
            color: #343a40;
            margin-bottom: 20px;
            font-weight: bold;
        }
        
        .right-details p, .right-details ul, .right-details ol {
            font-size: 18px;
            color: #444444;
            line-height: 1.6;
        }
        
        .right-details ul {
            list-style-type: disc;
            margin-left: 20px;
        }
        
        .right-details ol {
            list-style-type: decimal;
            margin-left: 20px;
        }
        
        footer {
            padding: 20px 0;
            text-align: center;
            color: #6c757d;
            font-weight: 300;
        }
        
        footer p {
            margin: 0;
            margin-bottom: 10px;
        }
        
        hr {
            border: none;
            height: 1px;
            background-color: #afafaf;
            margin: 30px 0;
            width: 100%;
        }
        
        
        /* Transition effects */
        @keyframes slide-in-animation {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .slide-in {
            animation: slide-in-animation 1s forwards;
        }
        
        
        
        /* Project Materials Section */
        .project-materials {
            padding: 50px 5%;
            background: #f8f9fa;
            text-align: center;
        }
        
        .project-materials h2 {
            font-size: 36px;
            color: #343a40;
            margin-bottom: 40px;
            font-weight: bold;
        }
        
        .material-grid {
            display: flex;
            justify-content: space-between;
        }
        
        .material {
            position: relative;
            width: 30%;
            text-decoration: none; /* Ensures link does not have an underline */
        }
        
        .material img {
            width: 100%;
            height: auto;
            display: block;
            border-radius: 10px;
        }
        
        .material .overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.4); /* Initial overlay with low opacity */
            border-radius: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            transition: background 0.3s ease;
        }
        
        .material .initial-text {
            color: white;
            font-size: 24px;
            transition: transform 0.3s ease;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            font-weight: bold;
        }
        
        .material .hover-text {
            color: white;
            font-size: 18px;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
        }
        
        .material:hover .overlay {
            background: linear-gradient(135deg, rgba(0, 0, 255, 0.7), rgba(255, 0, 0, 0.7));
        }
        
        .material:hover .initial-text {
            transform: translate(-50%, -200%); /* Move the title further up */
        }
        
        .material:hover .hover-text {
            opacity: 1;
            transform: translate(-50%, -50%);
        }        
        `,
        "dashboard.html": `
              
        `,
        "dashboard.html": `
              
        `,
        "dashboard.html": `
              
        `,
        "group_members.css": `
        body {
            font-family: Arial, sans-serif;
        }
        
        .team-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .title {
            font-size: 36px;
            text-align: center;
            margin-bottom: 30px;
            margin-top: 20px;
        }
        
        .card-container {
            display: flex;
            gap: 40px;
            align-items: flex-start;
        }
        
        .card {
            position: relative;
            width: 300px;
            height: 400px;
            border: 1px solid #ccc;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            transition: all 0.3s ease;
            overflow: hidden;
            background: #fff;
            border-radius: 10px;
        }
        
        .card img {
            width: 100%;
            height: 200px;
            object-fit: cover;
            border-radius: 10px 10px 0 0;
        }
        
        .card-content {
            padding: 20px;
            text-align: left;
        }
        
        .card-content .name {
            font-size: 22px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .card-content p {
            margin: 5px 0;
        }
        
        .card-content hr {
            margin: 10px 0;
        }
        
        .social-icons {
            display: flex;
            justify-content: center; /* Center align for default card */
            gap: 30px;
        }
        
        .social-icons a {
            color: #000;
            text-decoration: none;
            font-size: 24px; /* Increased icon size */
        }
        
        .social-icons a:hover {
            color: #007bff;
        }
        
        .card-hover-content {
            display: flex;
            flex-direction: row; /* Keep content side by side */
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #fff;
            padding: 15px;
            box-sizing: border-box;
            visibility: hidden;
            opacity: 0;
            transition: all 0.3s ease;
        }
        
        .card-hover-content img {
            width: 300px;
            height: 100%;
            object-fit: cover;
            border-radius: 10px; /* Adjust border radius for the left side */
            margin-right: 10px; /* Increase gap between image and content */
        }
        
        .hover-content {
            display: flex;
            flex-direction: column;
            padding: 20px;
            padding-top: 0; /* Align with image padding */
            box-sizing: border-box;
            overflow-y: hidden; /* Prevent scrolling on the container */
            height: 100%;
            width: calc(100% - 310px); /* Ensure content fits the remaining space, account for increased gap */
        }
        
        .hover-content .name, .hover-content .id, .hover-content .department, .hover-content .university {
            margin: 5px 0; /* Reduce spacing between text elements */
        }
        
        .hover-content .description {
            margin: 15px 0;
            flex: 1; /* Take up remaining space to push the icons down */
            overflow-y: auto; /* Allow vertical scrolling for the description */
        }
        
        .card:hover {
            width: 850px;  /* Increased width for hover effect */
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);  /* More shadow for cards */
        }
        
        .card:hover .card-hover-content {
            visibility: visible;
            opacity: 1;
        }
        
        .card:hover .social-icons {
            justify-content: flex-start; /* Align icons to the left on hover */
            gap: 40px; /* Slightly increase gap between icons */
            margin-top: 20px; /* Place social icons 20px below the hr */
        }
        
        .card-hover-content hr {
            margin: 5px 0 0; /* Ensure hr margin stays as intended */
        }        
        `,
        "dashboard.css": `
        body {
            background-color: #DBDBDB;
        }
        
        .main-container {
            max-width: 1200px;
            margin: 20px auto;
        }
        
        .welcome-message {
            padding-top: 20px;   /* Add padding to the top */
            color: #444444;      /* Text color */
            font-weight: bold;   /* Bold text */
            font-size: 1.5em;    /* Make the welcome message bigger */
        }
        
        .dashboard-container {
            display: flex;
            padding: 0;  /* Remove padding */
            box-shadow: 0 6px 25px rgba(0, 0, 0, 0.3);  /* Darker shadow */
            border-radius: 10px;  /* Maintain border-radius */
            background-color: #ECECEC;
        }
        
        .sidebar {
            width: 250px;  /* Adjust width to cover full height */
            background-color: #DBDBDB;  /* Sidebar background color covering full height */
            padding: 0;  /* Remove padding to cover full height */
            border-top-left-radius: 10px;  /* Add border radius to top-left */
            border-bottom-left-radius: 10px;  /* Add border radius to bottom-left */
        }
        
        .sidebar ul {
            list-style: none;
            padding: 0;
            margin: 0;  /* Remove margin from ul */
        }
        
        .sidebar li {
            margin: 0;  /* Remove margin to cover full width */
            border-bottom: 1px solid #ddd;  /* Add bottom border */
        }
        
        .sidebar li:first-child a {
            border-top-left-radius: 10px;  /* Add radius to first item */
        }
        
        .sidebar li:last-child a {
            border-bottom-left-radius: 10px;  /* Add radius to last item */
        }
        
        .sidebar li hr {
            margin: 0;  /* Remove margin from hr */
            border: 0;
            border-top: 1px solid #ddd;
        }
        
        .sidebar li a {
            text-decoration: none;
            color: #444444;  /* Text color */
            padding: 25px 20px 25px 30px;  /* Adjust padding for full height click area (top, right, bottom, left) */
            display: block;
            font-weight: bolder;  /* More bold text */
            font-size: 1.1em;     /* Increase the menu text size */
            transition: background-color 0.3s, background-image 0.3s;
        }
        
        .sidebar li a:hover {
            background-image: linear-gradient(to bottom, #C2C2C2, #DBDBDB, #C2C2C2); /* Gradient background for active state */
            color: #444444;
        }
        
        .sidebar li.active a {
            position: relative;
            color: #444444;
            background-image: linear-gradient(to bottom, #ECECEC, #c7c6c6);  /* Gradient hover effect */
        }
        
        .sidebar li.active a::after {
            content: "";
            position: absolute;
            right: 0px;  /* Adjusted to appear on the right side */
            top: 50%;
            transform: translateY(-50%) rotate(0deg); /* Arrow pointing left */
            border-width: 15px;
            border-style: solid;
            border-color: transparent #ECECEC transparent transparent;  /* Arrow head color */
        }
        
        .dashboard-content {
            flex: 1;
            padding: 20px;  /* Add padding on all sides */
        }        
        `,
        "about_project_scripts.js": `
        document.addEventListener('DOMContentLoaded', () => {
            const options = document.querySelectorAll('.option');
            const sections = document.querySelectorAll('.content-section');
            const optionsContainer = document.querySelector('.options-container');
            let firstClick = true;
        
            options.forEach(option => {
                option.addEventListener('click', () => {
                    // Remove active class from all options and sections
                    options.forEach(opt => opt.classList.remove('active'));
                    sections.forEach(sec => sec.classList.remove('active', 'fade-in', 'slide-in', 'zoom-in', 'flip-in'));
        
                    // Add active class to clicked option and corresponding section
                    option.classList.add('active');
                    const targetSection = document.getElementById(option.getAttribute('data-target'));
        
                    // Add specific transition class based on the clicked option
                    switch (option.getAttribute('data-target')) {
                        case 'overview':
                            targetSection.classList.add('slide-in');
                            break;
                        case 'features':
                            targetSection.classList.add('slide-in');
                            break;
                        case 'technologies':
                            targetSection.classList.add('slide-in');
                            break;
                        case 'how-it-works':
                            targetSection.classList.add('slide-in');
                            break;
                        default:
                            targetSection.classList.add('slide-in');
                    }
        
                    targetSection.classList.add('active');
        
                    // Scroll to options container only on the first click
                    if (firstClick) {
                        smoothScrollTo(optionsContainer, 1000); // Duration in milliseconds (1000ms = 1 second)
                        firstClick = false;
                    }
                });
            });
        
            function smoothScrollTo(element, duration) {
                let targetPosition = element.getBoundingClientRect().top + window.pageYOffset;
                let startPosition = window.pageYOffset;
                let startTime = null;
        
                function animation(currentTime) {
                    if (startTime === null) startTime = currentTime;
                    let timeElapsed = currentTime - startTime;
                    let run = ease(timeElapsed, startPosition, targetPosition - startPosition, duration);
                    window.scrollTo(0, run);
                    if (timeElapsed < duration) requestAnimationFrame(animation);
                }
        
                function ease(t, b, c, d) {
                    t /= d / 2;
                    if (t < 1) return c / 2 * t * t + b;
                    t--;
                    return -c / 2 * (t * (t - 2) - 1) + b;
                }
        
                requestAnimationFrame(animation);
            }
        });        
        `,
        "requirements.txt": `
Flask
Flask-Login
Flask-MySQLdb
Werkzeug
tensorflow
Pillow
        `,
        "email_verification.txt": `
Hello,

Thank you for registering. Please click on the link below to verify your email address:

{{ link }}

If you did not register for this account, please ignore this email.

Thanks,
The Image Classification Team

        `,
        "password_reset.txt": `
Hello,

We received a request to reset your password. Please click the link below to reset your password:

{{ link }}

If you did not make this request, please ignore this email.

Thank you!
        `,
        // "dashboard.html": `

        // `,
        // "dashboard.html": `

        // `,

        // Add more code snippets as needed
    };

    document.querySelectorAll('.code-box').forEach(function (codeBox) {
        codeBox.addEventListener('click', function (event) {
            event.preventDefault();
            var codeKey = codeBox.getAttribute('data-code');
            var codeContent = codes[codeKey];
            codeDisplay.textContent = codeContent;
            copyBtn.textContent = "Copy";
            modal.style.display = "block";
        });
    });

    span.onclick = function () {
        modal.style.display = "none";
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    }

    copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(codeDisplay.textContent).then(function () {
            copyBtn.textContent = "Copied";
            copyBtn.classList.add("copied");
        }, function (err) {
            alert('Failed to copy text: ', err);
        });
    });
});

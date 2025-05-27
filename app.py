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
import json  # ✅ Add this

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

    prob_result = [round(float(prob[i] * 100), 2) for i in range(3)]
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
    
    # ✅ Parse JSON result safely
    parsed_history = []
    class_options = set()
    for entry in history:
        image_path, result_str, created_at = entry
        try:
            result_dict = json.loads(result_str)
            parsed_history.append((image_path, result_dict, created_at))
            
            for i in range(1, 4):
                class_name = result_dict['class' + str(i)]
                class_options.add(class_name)
        except json.JSONDecodeError:
            continue  # ✅ skip broken old records

    # Filter by selected class
    if selected_class:
        parsed_history = [entry for entry in parsed_history if selected_class in entry[1].values()]
        parsed_history.sort(key=lambda x: next(v for k, v in x[1].items() if k.startswith('prob') and x[1]['class' + k[-1]] == selected_class), reverse=True)

    sorted_class_options = sorted(class_options)

    # Pagination
    results_per_page = 10
    total_results = len(parsed_history)
    total_pages = math.ceil(total_results / results_per_page)
    
    start_index = (page - 1) * results_per_page
    end_index = start_index + results_per_page
    paginated_history = parsed_history[start_index:end_index]

    # Page range logic
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
                    "prob1": float(prob_result[0]),
                    "prob2": float(prob_result[1]),
                    "prob3": float(prob_result[2]),
                }

                cursor = mysql.connection.cursor()
                cursor.execute("INSERT INTO search_history (user_id, image_path, result) VALUES (%s, %s, %s)", (current_user.id, img, json.dumps(predictions)))
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
                    "prob1": float(prob_result[0]),
                    "prob2": float(prob_result[1]),
                    "prob3": float(prob_result[2]),
                }

                cursor = mysql.connection.cursor()
                cursor.execute("INSERT INTO search_history (user_id, image_path, result) VALUES (%s, %s, %s)", (current_user.id, img, json.dumps(predictions)))
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

from flask import Flask, send_from_directory, request, jsonify, Response
from werkzeug.utils import secure_filename
from functools import wraps
import razorpay
import sqlite3
import hashlib
import hmac
import os
import time
import json

app = Flask(__name__, static_folder='public', static_url_path='')

UPLOAD_FOLDER = 'public/images'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def get_db():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.executescript('''
        CREATE TABLE IF NOT EXISTS products (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            name      TEXT    NOT NULL,
            price     INTEGER NOT NULL,
            image     TEXT,
            category  TEXT,
            type      TEXT,
            createdAt INTEGER DEFAULT (strftime('%s','now')),
            soldCount INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS orders (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            items             TEXT    NOT NULL,
            total             INTEGER NOT NULL,
            address           TEXT,
            razorpay_order_id TEXT,
            status            TEXT    DEFAULT 'pending',
            createdAt         INTEGER DEFAULT (strftime('%s','now'))
        );
    ''')
    conn.commit()
    conn.close()


init_db()


# ── Admin auth ────────────────────────────────────────────────────────────────
def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.authorization
        expected = os.environ.get('ADMIN_PASSWORD')

        if not auth or auth.username != "admin" or auth.password != expected:
            return Response(
                "Authentication required",
                401,
                {"WWW-Authenticate": 'Basic realm="Ethniq Loom Admin"'}
            )

        return f(*args, **kwargs)

    return decorated


# ======================
# SERVE PAGES
# ======================
@app.route('/')
def home():
    return send_from_directory('public', 'index.html')

@app.route('/admin')
@require_admin
def admin():
    return send_from_directory('public', 'admin.html')


# ======================
# ADD PRODUCT (protected)
# ======================
@app.route('/add-product', methods=['POST'])
@require_admin
def add_product():
    name     = request.form.get('name')
    price    = request.form.get('price')
    category = request.form.get('category')
    type_    = request.form.get('type')

    image_file = request.files['image']
    filename   = secure_filename(image_file.filename)
    filepath   = os.path.join(UPLOAD_FOLDER, filename)
    image_file.save(filepath)

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO products (name, price, image, category, type, createdAt, soldCount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (name, price, f"images/{filename}", category.lower(), type_, int(time.time()), 0))
    conn.commit()
    conn.close()

    return jsonify({"message": "Product added successfully!"})


# ======================
# DELETE PRODUCT (protected)
# ======================
@app.route('/delete-product/<int:product_id>', methods=['DELETE'])
@require_admin
def delete_product(product_id):
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Product deleted successfully!"})


# ======================
# UPDATE PRODUCT (protected)
# ======================
@app.route('/update-product/<int:product_id>', methods=['PUT'])
@require_admin
def update_product(product_id):
    name     = request.form.get('name')
    price    = request.form.get('price')
    category = request.form.get('category')
    type_    = request.form.get('type')

    update_fields = []
    update_values = []

    if name:
        update_fields.append("name = ?")
        update_values.append(name)
    if price:
        update_fields.append("price = ?")
        update_values.append(price)
    if category:
        update_fields.append("category = ?")
        update_values.append(category.lower())
    if type_:
        update_fields.append("type = ?")
        update_values.append(type_)

    if 'image' in request.files:
        image_file = request.files['image']
        filename   = secure_filename(image_file.filename)
        filepath   = os.path.join(UPLOAD_FOLDER, filename)
        image_file.save(filepath)
        update_fields.append("image = ?")
        update_values.append(f"images/{filename}")

    if not update_fields:
        return jsonify({"message": "No fields to update"}), 400

    update_values.append(product_id)

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE products SET {', '.join(update_fields)} WHERE id = ?", update_values)
    conn.commit()
    conn.close()

    return jsonify({"message": "Product updated successfully!"})


@app.route('/images/<path:filename>')
def serve_images(filename):
    return send_from_directory('public/images', filename)


# ======================
# CREATE ORDER
# ======================
@app.route('/create-order', methods=['POST'])
def create_order():
    data    = request.json
    items   = data.get('items')
    total   = data.get('total')
    address = data.get('address')

    client = razorpay.Client(auth=(
        os.environ.get('RAZORPAY_KEY_ID'),
        os.environ.get('RAZORPAY_KEY_SECRET')
    ))
    rz_order = client.order.create({
        'amount':   total * 100,
        'currency': 'INR',
        'receipt':  f'order_{int(time.time())}',
    })

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO orders (items, total, address, razorpay_order_id, status, createdAt)
        VALUES (?, ?, ?, ?, 'pending', ?)
    ''', (json.dumps(items), total, json.dumps(address), rz_order['id'], int(time.time())))

    for item in items:
        cursor.execute(
            "UPDATE products SET soldCount = soldCount + ? WHERE name = ?",
            (item['qty'], item['name'])
        )

    conn.commit()
    conn.close()

    return jsonify({'amount': rz_order['amount'], 'razorpayOrderId': rz_order['id']})


# ======================
# VERIFY PAYMENT
# ======================
@app.route('/verify-payment', methods=['POST'])
def verify_payment():
    data               = request.json
    order_id           = data.get('razorpay_order_id')
    payment_id         = data.get('razorpay_payment_id')
    received_signature = data.get('razorpay_signature')

    secret  = os.environ.get('RAZORPAY_KEY_SECRET', '').encode()
    message = f'{order_id}|{payment_id}'.encode()
    expected = hmac.new(secret, message, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, received_signature):
        return jsonify({'success': False}), 400

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET status = 'paid' WHERE razorpay_order_id = ?", (order_id,))
    conn.commit()
    conn.close()

    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True)

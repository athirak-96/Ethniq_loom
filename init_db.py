"""
Run once to initialise database.db with the required tables.
Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
"""
import sqlite3

conn = sqlite3.connect('database.db')
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
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        items     TEXT    NOT NULL,
        total     INTEGER NOT NULL,
        address   TEXT,
        createdAt INTEGER DEFAULT (strftime('%s','now'))
    );
''')

conn.commit()
conn.close()

print("database.db ready — products and orders tables created.")

#!/usr/bin/python
#
# Trimmed from https://github.com/edsonlead/bottle_crud — project/controllers/controller.py
#
import sqlite3
from bottle import request
from bottle import route, template


@route('/')
@route('/index')
def index():
    conn = sqlite3.connect('checklist.db')
    cl = conn.cursor()
    cl.execute("SELECT id, task, description, status FROM checklist")
    result = cl.fetchall()
    cl.close()
    return template('index', rows=result)


@route('/create', method='GET')
def new():
    if request.GET.get('save', '').strip():
        return '<p>inserted</p>'
    return template('create_task.tpl')


@route('/update/<no:int>', method='GET')
def update(no):
    return template('update_task', old=None, no=no)


@route('/delete/<no:int>', method='GET')
def delete(no):
    return '<p>The task ID = %s was delete!</p>' % no

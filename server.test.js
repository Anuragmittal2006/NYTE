const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { expect } = require('chai');
const sinon = require('sinon');
const nodemailer = require('nodemailer');

const app = require('./server');

describe('POST /login', () => {
});

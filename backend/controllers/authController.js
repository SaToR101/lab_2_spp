const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pool = require('../db');
const logger = require('../utils/logger');

// Вспомогательная функция для генерации токенов
const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { id: user.id, role_id: user.role_id },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
    );
    const refreshToken = jwt.sign(
        { id: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
};

// 1. Регистрация
exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'Bad Request', message: 'Пользователь уже существует', code: 400 });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO users (email, password_hash, role_id) VALUES ($1, $2, $3) RETURNING id, email, role_id',
            [email, hashedPassword, 2] // 2 - роль User
        );

        res.status(201).json({ message: 'Успешная регистрация', user: newUser.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message, code: 500 });
    }
};

// 2. Вход
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Неверный email или пароль', code: 401 });
        }

        const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Неверный email или пароль', code: 401 });
        }

        const tokens = generateTokens(user.rows[0]);

        await pool.query(
            'INSERT INTO refresh_tokens (user_id, token, user_agent, ip_address) VALUES ($1, $2, $3, $4)',
            [user.rows[0].id, tokens.refreshToken, req.headers['user-agent'], req.ip]
        );

        res.status(200).json(tokens);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message, code: 500 });
    }
};

// 3. Обновление токена (Refresh Token)
exports.refreshToken = async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(401).json({ error: 'Unauthorized', message: 'Токен не предоставлен', code: 401 });

    try {
        const storedToken = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [token]);
        if (storedToken.rows.length === 0) {
            return res.status(403).json({ error: 'Forbidden', message: 'Недействительный Refresh Token', code: 403 });
        }

        jwt.verify(token, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
            if (err) return res.status(403).json({ error: 'Forbidden', message: 'Токен истек', code: 403 });

            const accessToken = jwt.sign(
                { id: decoded.id },
                process.env.JWT_ACCESS_SECRET,
                { expiresIn: '15m' }
            );
            res.json({ accessToken });
        });
    } catch (error) {
        logger.error(`Ошибка обновления токена: ${error.message}`);
        res.status(500).json({ error: 'Internal Server Error', message: error.message, code: 500 });
    }
};

// 4. Запрос на восстановление пароля (Отправка письма)
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'Not Found', message: 'Пользователь не найден', code: 404 });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 час

        await pool.query(
            'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE email = $3',
            [resetToken, expires, email]
        );

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.ethereal.email',
            port: process.env.SMTP_PORT || 587,
            auth: {
                user: process.env.SMTP_USER || 'test@ethereal.email',
                pass: process.env.SMTP_PASS || 'pass'
            }
        });

        const resetUrl = `http://localhost:8080/reset-password.html?token=${resetToken}`;
        await transporter.sendMail({
            from: '"Support" <noreply@app.com>',
            to: email,
            subject: 'Восстановление доступа к системе',
            html: `<p>Для сброса пароля перейдите по ссылке: <a href="${resetUrl}">${resetUrl}</a></p>`
        });

        logger.info(`Отправлена ссылка сброса пароля на email: ${email}`);
        res.status(200).json({ message: 'Ссылка для сброса пароля отправлена на электронную почту' });
    } catch (error) {
        logger.error(`Ошибка восстановления пароля: ${error.message}`);
        res.status(500).json({ error: 'Internal Server Error', message: error.message, code: 500 });
    }
};
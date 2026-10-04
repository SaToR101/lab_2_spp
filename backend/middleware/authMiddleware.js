const jwt = require('jsonwebtoken');

// Проверка наличия и валидности JWT-токена
exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Формат "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            message: 'Токен доступа отсутствует', 
            code: 401 
        });
    }

    jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                error: 'Forbidden', 
                message: 'Невалидный или истекший токен', 
                code: 403 
            });
        }
        req.user = user; // Сохраняем данные пользователя (id, role_id)
        next();
    });
};

// Проверка прав доступа по ролям (1 - Guest, 2 - User, 3 - Admin)
exports.checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role_id)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'У вас недостаточно прав для выполнения этой операции',
                code: 403
            });
        }
        next();
    };
};
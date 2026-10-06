const { Router } = require('express');
const auth = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { loginLimiter, forgotLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.post('/register', auth.register);
router.post('/login', loginLimiter, auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.post('/forgot-password', forgotLimiter, auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);

router.get('/me', verifyToken, auth.me);
router.get('/sessions', verifyToken, auth.listSessions);
router.delete('/sessions/:id', verifyToken, auth.revokeSession);

module.exports = router;

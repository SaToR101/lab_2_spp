const { Router } = require('express');
const users = require('../controllers/userController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');
const { ROLE } = require('../utils/permissions');

// Управление пользователями — только для администратора
const router = Router();
router.use(verifyToken, checkRole([ROLE.ADMIN]));

router.get('/', users.list);
router.patch('/:id/role', users.changeRole);

module.exports = router;

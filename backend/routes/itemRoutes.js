const { Router } = require('express');
const items = require('../controllers/itemController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/upload');
const { ROLE, ALL_ROLES } = require('../utils/permissions');

// Читать могут все роли; создавать — пользователь и админ; менять/удалять чужие записи — только админ (см. canModifyItem)
const canRead = checkRole(ALL_ROLES);
const canWrite = checkRole([ROLE.USER, ROLE.ADMIN]);
const withFile = upload.single('file');

const router = Router();
router.use(verifyToken);

router.get('/', canRead, items.list);
router.get('/:id', canRead, items.get);
router.post('/', canWrite, withFile, items.create);
router.put('/:id', canWrite, withFile, items.update);
router.delete('/:id', canWrite, items.remove);

module.exports = router;

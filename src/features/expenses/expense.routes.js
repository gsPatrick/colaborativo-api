const express = require('express');
const router = express.Router();
const expenseController = require('./expense.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// Aplica o middleware de autenticação a todas as rotas de despesas.
// Isso garante que apenas usuários logados possam acessar estas funcionalidades.
router.use(authMiddleware);

/**
 * @route   GET /api/expenses
 * @desc    Lista todas as despesas do usuário logado.
 *          Pode ser filtrado por projeto via query string (ex: ?projectId=1).
 * @access  Private
 */
router.get('/expenses', expenseController.findAll);

/**
 * @route   POST /api/expenses
 * @desc    Cria uma nova despesa para o usuário logado.
 *          O corpo da requisição deve conter os dados da despesa.
 * @access  Private
 */
router.post('/expenses', expenseController.create);

/**
 * @route   DELETE /api/expenses/:id
 * @desc    Deleta uma despesa específica pelo seu ID.
 * @access  Private
 */
router.delete('/expenses/:id', expenseController.delete);


module.exports = router;
const jwt = require('jsonwebtoken');
const db = require('../models');
const User = db.User;

const authMiddleware = async (req, res, next) => {
  let token;

  // O token geralmente é enviado no cabeçalho de autorização no formato "Bearer <token>"
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // 1. Extrai o token do cabeçalho
      token = req.headers.authorization.split(' ')[1];

      // 2. Verifica se o token é válido usando o segredo
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // 3. Anexa o usuário ao objeto 'req' para uso posterior nas rotas
      // Buscamos o usuário no DB sem a senha para garantir segurança
      req.user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });
      
      if (!req.user) {
        return res.status(401).json({ message: 'Usuário do token não encontrado.' });
      }

      next(); // Se tudo deu certo, continua para a próxima função (o controller)
    } catch (error) {
      return res.status(401).json({ message: 'Token inválido ou expirado. Acesso não autorizado.' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Nenhum token fornecido. Acesso não autorizado.' });
  }
};

module.exports = authMiddleware;
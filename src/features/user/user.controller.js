const userService = require('./user.service');

// Controller para registrar um novo usuário
exports.register = async (req, res) => {
  try {
    const user = await userService.registerUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: "Erro no registro", error: error.message });
  }
};

// Controller para fazer login
exports.login = async (req, res) => {
  try {
    const { user, token } = await userService.loginUser(req.body);
    res.status(200).json({ 
        message: "Login bem-sucedido!",
        user,
        token
    });
  } catch (error) {
    res.status(401).json({ message: "Falha na autenticação", error: error.message });
  }
};

// Controller para buscar o perfil do próprio usuário (rota protegida)
exports.getMe = async (req, res) => {
  try {
    // O ID do usuário vem do middleware de autenticação (req.user.id)
    const userProfile = await userService.getUserProfile(req.user.id);
    res.status(200).json(userProfile);
  } catch (error) {
    res.status(404).json({ message: "Erro ao buscar perfil", error: error.message });
  }
};
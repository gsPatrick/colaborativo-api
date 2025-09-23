const db = require('../../models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = db.User;

/**
 * Serviço para registrar um novo usuário, diferenciando 'dev' de 'agency'.
 */
exports.registerUser = async (userData) => {
  const { name, email, password, label, cpf, phone, companyName, companyFantasyName, companyCnpj } = userData;
  
  // Validações de campos obrigatórios
  if (!email || !password || !name || !label) {
    throw new Error("Dados essenciais (nome, email, senha, tipo) são obrigatórios.");
  }
  if (password.length < 6) {
    throw new Error("A senha deve ter no mínimo 6 caracteres.");
  }
  
  // Verifica se o email já está em uso
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new Error("Este e-mail já está em uso.");
  }

  // Validações de campos únicos, ignorando strings vazias
  if (cpf && cpf.trim() !== '') {
    const existingCpf = await User.findOne({ where: { cpf } });
    if (existingCpf) throw new Error("Este CPF já está em uso.");
  }
  if (label === 'agency' && companyCnpj && companyCnpj.trim() !== '') {
    const existingCnpj = await User.findOne({ where: { companyCnpj } });
    if (existingCnpj) throw new Error("Este CNPJ já está em uso.");
  }

  // Criptografa a senha antes de salvar no banco
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
    label,
    cpf: cpf || null, // Garante que campos vazios sejam salvos como nulos
    phone: phone || null,
    // Apenas salva os dados da empresa se o label for 'agency'
    companyName: label === 'agency' ? companyName : null,
    companyFantasyName: label === 'agency' ? companyFantasyName : null,
    companyCnpj: label === 'agency' ? companyCnpj : null,
  });

  newUser.password = undefined; // Nunca retorne a senha na resposta da API
  return newUser;
};

/**
 * Serviço para autenticar um usuário e retornar um token JWT.
 */
exports.loginUser = async (loginData) => {
  const { email, password } = loginData;
  if (!email || !password) {
    throw new Error("E-mail e senha são obrigatórios.");
  }

  const user = await User.findOne({ where: { email } });
  
  // Compara a senha enviada com a senha criptografada no banco
  if (user && bcrypt.compareSync(password, user.password)) {
    // Se as senhas baterem, gera o token JWT
    const token = jwt.sign(
      { id: user.id }, // Carga útil (payload) do token
      process.env.JWT_SECRET, // Segredo para assinar o token
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' } // Tempo de expiração
    );
    
    user.password = undefined; // Remove a senha do objeto de retorno
    return { user, token };
  }
  
  throw new Error("Credenciais inválidas.");
};

/**
 * Serviço para buscar o perfil completo do usuário logado.
 */
exports.getUserProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    // Exclui apenas o campo de senha da resposta por segurança
    attributes: { exclude: ['password'] }
  });

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }
  
  return user; // Retorna todos os outros campos, incluindo os de empresa
};
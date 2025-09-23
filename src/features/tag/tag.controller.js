const tagService = require('./tag.service');

// Criar nova tag
exports.create = async (req, res) => {
  try {
    const userId = req.user.id;
    const tag = await tagService.createTag(req.body, userId);
    res.status(201).json(tag);
  } catch (error) {
    res.status(400).json({ message: "Erro ao criar tag", error: error.message });
  }
};

// Listar todas as tags do usuário
exports.findAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const tags = await tagService.findTagsByUser(userId);
    res.status(200).json(tags);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar tags", error: error.message });
  }
};

// Atualizar uma tag
exports.update = async (req, res) => {
  try {
    const tagId = req.params.id;
    const userId = req.user.id;
    const tag = await tagService.updateTag(tagId, req.body, userId);
    res.status(200).json(tag);
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao atualizar tag", error: error.message });
  }
};

// Deletar uma tag
exports.delete = async (req, res) => {
  try {
    const tagId = req.params.id;
    const userId = req.user.id;
    await tagService.deleteTag(tagId, userId);
    res.status(204).send();
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao deletar tag", error: error.message });
  }
};
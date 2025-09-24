const platformService = require('./platform.service');

/**
 * Controller para criar uma nova plataforma.
 */
exports.create = async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = await platformService.createPlatform(req.body, userId);
    res.status(201).json(platform);
  } catch (error) {
    res.status(400).json({ message: "Erro ao criar plataforma", error: error.message });
  }
};

/**
 * Controller para listar todas as plataformas do usuário.
 */
exports.findAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const platforms = await platformService.findAllPlatformsByUser(userId);
    res.status(200).json(platforms);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar plataformas", error: error.message });
  }
};

/**
 * Controller para atualizar uma plataforma.
 */
exports.update = async (req, res) => {
  try {
    const platformId = req.params.id;
    const userId = req.user.id;
    const platform = await platformService.updatePlatform(platformId, req.body, userId);
    res.status(200).json(platform);
  } catch (error) {
    const statusCode = error.message.includes("negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao atualizar plataforma", error: error.message });
  }
};

/**
 * Controller para deletar uma plataforma.
 */
exports.delete = async (req, res) => {
  try {
    const platformId = req.params.id;
    const userId = req.user.id;
    await platformService.deletePlatform(platformId, userId);
    res.status(204).send();
  } catch (error) {
    const statusCode = error.message.includes("negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao deletar plataforma", error: error.message });
  }
};
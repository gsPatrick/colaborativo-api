const db = require('../../models');
const { Op } = require('sequelize');
const Platform = db.Platform;

/**
 * Cria uma nova plataforma customizada para o usuário.
 */
exports.createPlatform = async (platformData, userId) => {
  const { name, defaultCommissionPercent, logoUrl } = platformData;
  if (!name) {
    throw new Error("O nome da plataforma é obrigatório.");
  }

  const existingPlatform = await Platform.findOne({ where: { name, userId } });
  if (existingPlatform) {
    throw new Error("Você já possui uma plataforma com este nome.");
  }

  const platform = await Platform.create({
    userId,
    name,
    defaultCommissionPercent,
    logoUrl,
  });
  return platform;
};

/**
 * Lista todas as plataformas customizadas de um usuário.
 */
exports.findAllPlatformsByUser = async (userId) => {
  return Platform.findAll({
    where: { userId },
    order: [['name', 'ASC']]
  });
};

/**
 * Atualiza uma plataforma customizada.
 */
exports.updatePlatform = async (platformId, updateData, userId) => {
  const platform = await Platform.findByPk(platformId);
  if (!platform) {
    throw new Error("Plataforma não encontrada.");
  }
  if (platform.userId !== userId) {
    throw new Error("Acesso negado. Esta plataforma não pertence a você.");
  }

  // Validação de nome único em caso de atualização
  if (updateData.name && updateData.name !== platform.name) {
      const existingPlatform = await Platform.findOne({ where: { name: updateData.name, userId } });
      if (existingPlatform) {
          throw new Error("Você já possui outra plataforma com este nome.");
      }
  }

  await platform.update(updateData);
  return platform;
};

/**
 * Deleta uma plataforma customizada.
 */
exports.deletePlatform = async (platformId, userId) => {
  const platform = await Platform.findByPk(platformId);
  if (!platform) {
    throw new Error("Plataforma não encontrada.");
  }
  if (platform.userId !== userId) {
    throw new Error("Acesso negado. Esta plataforma não pertence a você.");
  }

  // O 'onDelete: SET NULL' na associação do Project cuidará da referência
  await platform.destroy();
  return { message: "Plataforma deletada com sucesso." };
};
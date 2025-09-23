const db = require('../../models');
const Priority = db.Priority;

/**
 * Cria uma nova prioridade para o usuário logado.
 */
exports.createPriority = async (priorityData, userId) => {
  const { name, color, order } = priorityData;
  if (!name) {
    throw new Error("O nome da prioridade é obrigatório.");
  }

  // Verifica se o usuário já tem uma prioridade com o mesmo nome
  const existingPriority = await Priority.findOne({ where: { name, userId } });
  if (existingPriority) {
    throw new Error("Você já possui uma prioridade com este nome.");
  }

  const priority = await Priority.create({
    name,
    color,
    order,
    userId,
  });

  return priority;
};

/**
 * Lista todas as prioridades do usuário logado.
 */
exports.findPrioritiesByUser = async (userId) => {
  const priorities = await Priority.findAll({
    where: { userId },
    order: [['order', 'ASC'], ['name', 'ASC']], // Ordena pela ordem definida e depois pelo nome
  });
  return priorities;
};

/**
 * Atualiza uma prioridade, verificando se pertence ao usuário.
 */
exports.updatePriority = async (priorityId, updateData, userId) => {
  const priority = await Priority.findByPk(priorityId);

  if (!priority) {
    throw new Error("Prioridade não encontrada.");
  }

  if (priority.userId !== userId) {
    throw new Error("Acesso negado. Esta prioridade não pertence à sua conta.");
  }

  await priority.update(updateData);
  return priority;
};

/**
 * Deleta uma prioridade, verificando se pertence ao usuário.
 */
exports.deletePriority = async (priorityId, userId) => {
  const priority = await Priority.findByPk(priorityId);

  if (!priority) {
    throw new Error("Prioridade não encontrada.");
  }

  if (priority.userId !== userId) {
    throw new Error("Acesso negado. Esta prioridade não pertence à sua conta.");
  }

  // A associação no model 'Project' está como 'allowNull: true' para priorityId.
  // O Sequelize automaticamente fará um 'SET NULL' nos projetos que usavam esta prioridade.
  await priority.destroy();
  
  return { message: "Prioridade deletada com sucesso." };
};
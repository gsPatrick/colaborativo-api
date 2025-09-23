const db = require('../../models');
const { Sequelize } = require('sequelize');
const Tag = db.Tag;
const Project = db.Project;

/**
 * Cria uma nova tag para o usuário logado.
 */
exports.createTag = async (tagData, userId) => {
  const { name } = tagData;
  if (!name) {
    throw new Error("O nome da tag é obrigatório.");
  }

  // Normaliza o nome da tag para evitar duplicatas (ex: "front-end" e "Front-end")
  const normalizedName = name.trim().toLowerCase();
  
  const existingTag = await Tag.findOne({ 
    where: { 
      name: normalizedName, 
      userId 
    } 
  });

  if (existingTag) {
    throw new Error("Você já possui uma tag com este nome.");
  }

  const tag = await Tag.create({
    name: normalizedName,
    userId,
  });

  return tag;
};

/**
 * Lista todas as tags do usuário, incluindo a contagem de projetos que a utilizam.
 */
exports.findTagsByUser = async (userId) => {
  const tags = await Tag.findAll({
    where: { userId },
    attributes: {
      include: [
        // Conta quantos projetos estão associados a esta tag
        [Sequelize.fn('COUNT', Sequelize.col('Projects.id')), 'projectCount']
      ]
    },
    include: [{
      model: Project,
      attributes: [], // Não traz os dados do projeto, apenas usa para o join da contagem
      through: { attributes: [] }
    }],
    group: ['Tag.id'], // Agrupa para a contagem funcionar corretamente
    order: [['name', 'ASC']],
  });
  return tags;
};

/**
 * Atualiza uma tag, verificando se pertence ao usuário.
 */
exports.updateTag = async (tagId, updateData, userId) => {
  const tag = await Tag.findByPk(tagId);

  if (!tag) {
    throw new Error("Tag não encontrada.");
  }

  if (tag.userId !== userId) {
    throw new Error("Acesso negado. Esta tag não pertence à sua conta.");
  }
  
  const { name } = updateData;
  if (name) {
      const normalizedName = name.trim().toLowerCase();
      
      const existingTag = await Tag.findOne({ where: { name: normalizedName, userId } });
      if (existingTag && existingTag.id !== parseInt(tagId)) {
        throw new Error("Você já possui uma tag com este nome.");
      }
      
      tag.name = normalizedName;
      await tag.save();
  }
  
  return tag;
};

/**
 * Deleta uma tag. A associação com projetos (na tabela ProjectTag) será removida automaticamente.
 */
exports.deleteTag = async (tagId, userId) => {
  const tag = await Tag.findByPk(tagId);

  if (!tag) {
    throw new Error("Tag não encontrada.");
  }

  if (tag.userId !== userId) {
    throw new Error("Acesso negado. Esta tag não pertence à sua conta.");
  }

  // O Sequelize cuidará de remover as entradas na tabela pivo `project_tags`
  await tag.destroy();
  
  return { message: "Tag deletada com sucesso." };
};
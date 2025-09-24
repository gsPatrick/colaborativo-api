const db = require('../../models');
const { Op } = require('sequelize');

const Project = db.Project;
const Client = db.Client;
const User = db.User;
const Tag = db.Tag;
const ProjectShare = db.ProjectShare;
const Collaboration = db.Collaboration;
const Transaction = db.Transaction; // Importa o modelo de Transação

// Função auxiliar para verificar permissão de acesso a um cliente
const checkClientPermission = async (clientId, userId) => {
  const client = await Client.findByPk(clientId, { include: ['SharedWith'] });
  if (!client) throw new Error("Cliente não encontrado.");

  const isOwner = client.ownerId === userId;
  const isSharedWith = client.SharedWith.some(user => user.id === userId);

  if (!isOwner && !isSharedWith) {
    throw new Error("Acesso negado. Você não tem permissão para usar este cliente.");
  }
  return true;
};

/**
 * Cria um novo projeto.
 */
exports.createProject = async (projectData, ownerId) => {
  const { 
      name, clientId, isNewClient, newClientName, tagIds, 
      partnerId, commissionType, commissionValue, 
      ...restOfData 
  } = projectData;

  let finalClientId;

  if (isNewClient && newClientName) {
    if (newClientName.trim() === '') {
        throw new Error("O nome do novo cliente não pode ser vazio.");
    }
    const newClient = await Client.create({
      legalName: newClientName, // Usa o campo correto
      ownerId: ownerId,
    });
    finalClientId = newClient.id;
  } else {
    if (!clientId) {
      throw new Error("Cliente é obrigatório.");
    }
    await checkClientPermission(clientId, ownerId);
    finalClientId = clientId;
  }

  if (!name) {
    throw new Error("Nome do projeto é obrigatório.");
  }

  const project = await Project.create({
    ...restOfData,
    name,
    clientId: finalClientId,
    ownerId,
  });

  if (partnerId && commissionType && commissionValue != null) {
      const partner = await User.findByPk(partnerId);
      if (!partner) throw new Error("Parceiro de colaboração não encontrado.");
      await project.addPartner(partner, {
          through: { commissionType, commissionValue, permissions: 'edit' }
      });
  }

  if (tagIds && tagIds.length > 0) {
    const tags = await Tag.findAll({ where: { id: tagIds, userId: ownerId } });
    await project.setTags(tags);
  }

  return this.findProjectById(project.id, ownerId);
};

/**
 * Lista todos os projetos de um usuário com filtros, paginação e sumário.
 */
exports.findAllProjectsForUser = async (userId, filters) => {
  const { status, priorityId, deadline, clientId, page = 1, limit = 6 } = filters;
  const offset = (page - 1) * limit;

  const sharedProjectShares = await ProjectShare.findAll({
    where: { partnerId: userId },
    attributes: ['projectId']
  });
  const sharedProjectIds = sharedProjectShares.map(share => share.projectId);

  const whereConditions = {
    [Op.or]: [
      { ownerId: userId },
      { id: { [Op.in]: sharedProjectIds } }
    ]
  };

  if (status) {
    if (status === 'active') {
      whereConditions.status = { [Op.in]: ['in_progress', 'paused'] };
    } else if (status === 'completed') {
      whereConditions.status = 'completed';
    }
  }
  if (priorityId) whereConditions.priorityId = priorityId;
  if (clientId) whereConditions.clientId = clientId;

  const allFilteredProjects = await Project.findAll({ where: whereConditions });
  
  const summary = allFilteredProjects.reduce((acc, project) => {
    acc.totalBudget += parseFloat(project.budget || 0);
    acc.totalReceived += parseFloat(project.paymentDetails.clientAmountPaid || 0);
    return acc;
  }, { totalBudget: 0, totalReceived: 0 });
  summary.totalToReceive = summary.totalBudget - summary.totalReceived;

  const { count, rows: projects } = await Project.findAndCountAll({
    where: whereConditions,
    include: [
      { model: User, as: 'Owner', attributes: ['id', 'name'] },
      // --- CORREÇÃO AQUI ---
      { model: Client, attributes: ['id', 'legalName', 'tradeName'] },
      { model: db.Priority, attributes: ['id', 'name', 'color'] },
      { model: Tag, through: { attributes: [] }, attributes: ['id', 'name'] },
      { model: User, as: 'Partners', attributes: ['id', 'name'], through: { attributes: ['permissions'] } }
    ],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    distinct: true
  });

  return {
    summary,
    pagination: {
      totalProjects: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page, 10)
    },
    projects
  };
};

/**
 * Busca um projeto pelo ID, validando a permissão do usuário.
 */
exports.findProjectById = async (projectId, userId) => {
  const project = await Project.findByPk(projectId, {
    include: [
        { model: User, as: 'Owner', attributes: ['id', 'name'] },
        { model: Client }, 
        { model: db.Priority, attributes: ['id', 'name', 'color'] },
        { model: Tag, through: { attributes: [] }, attributes: ['id', 'name'] },
        { model: User, as: 'Partners', attributes: ['id', 'name'], through: { attributes: ['commissionType', 'commissionValue', 'permissions'] } }, // Inclui dados da ProjectShare
        { model: Transaction, as: 'Transactions', order: [['paymentDate', 'DESC']] }
    ]
  });
  if (!project) throw new Error("Projeto não encontrado.");
  const isOwner = project.ownerId === userId;
  const isPartner = project.Partners.some(p => p.id === userId);
  if (!isOwner && !isPartner) {
    throw new Error("Acesso negado. Você não tem permissão para ver este projeto.");
  }
  return project;
};

/**
 * Atualiza um projeto.
 */
exports.updateProject = async (projectId, updateData, userId) => {
  const project = await this.findProjectById(projectId, userId);
  const { tagIds, priorityId, ...restOfData } = updateData; // Extrai priorityId

  const shareInfo = await ProjectShare.findOne({ where: { projectId, partnerId: userId } });
  const isOwner = project.ownerId === userId;
  const canEdit = isOwner || (shareInfo && shareInfo.permissions === 'edit');

  if (!canEdit) {
    throw new Error("Acesso negado. Você não tem permissão para editar este projeto.");
  }

  // --- CORREÇÃO AQUI ---
  // Garante que priorityId seja nulo se for uma string vazia ou undefined
  const finalPriorityId = priorityId === '' || priorityId === undefined ? null : parseInt(priorityId, 10);
  
  // Atualiza as tags, se enviadas
  if (tagIds) {
    const tags = await Tag.findAll({ where: { id: tagIds, userId: project.ownerId } });
    await project.setTags(tags);
  }

  await project.update({ ...restOfData, priorityId: finalPriorityId }); // Salva com o priorityId corrigido
  return this.findProjectById(projectId, userId);
};

/**
 * Deleta um projeto.
 */
exports.deleteProject = async (projectId, userId) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new Error("Projeto não encontrado.");
  if (project.ownerId !== userId) {
    throw new Error("Acesso negado. Apenas o proprietário pode deletar um projeto.");
  }
  await project.destroy();
  return { message: "Projeto deletado com sucesso." };
};

/**
 * Compartilha um projeto com um colaborador aceito.
 */
exports.shareProject = async (projectId, ownerId, shareData) => {
    const { partnerEmail, commissionType, commissionValue, permissions } = shareData;
    if (!partnerEmail || !commissionType || commissionValue == null) {
        throw new Error("Dados para compartilhamento incompletos.");
    }
    const project = await Project.findByPk(projectId);
    if (!project || project.ownerId !== ownerId) {
        throw new Error("Projeto não encontrado ou você não é o proprietário.");
    }
    const partner = await User.findOne({ where: { email: partnerEmail } });
    if (!partner) throw new Error("Colaborador não encontrado.");
    if (partner.id === ownerId) throw new Error("Você não pode compartilhar um projeto consigo mesmo.");
    const collaboration = await Collaboration.findOne({
        where: { status: 'accepted', [Op.or]: [{ requesterId: ownerId, addresseeId: partner.id }, { requesterId: partner.id, addresseeId: ownerId }] }
    });
    if (!collaboration) throw new Error("Você só pode compartilhar projetos com colaboradores aceitos.");
    await project.addPartner(partner, { through: { commissionType, commissionValue, permissions: permissions || 'read' } });
    return { message: `Projeto compartilhado com ${partner.name}.` };
};

/**
 * Para de compartilhar um projeto com um parceiro.
 */
exports.stopSharingProject = async (projectId, ownerId, partnerId) => {
    const project = await Project.findByPk(projectId);
    if (!project || project.ownerId !== ownerId) {
        throw new Error("Projeto não encontrado ou você não é o proprietário.");
    }
    const partner = await User.findByPk(partnerId);
    if (!partner) throw new Error("Parceiro não encontrado.");
    const result = await project.removePartner(partner);
    if (result === 0) throw new Error("Este projeto não estava compartilhado com o usuário especificado.");
    return { message: "Compartilhamento do projeto removido." };
};
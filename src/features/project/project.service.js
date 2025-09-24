const db = require('../../models');
const { Op } = require('sequelize');

const Project = db.Project;
const Client = db.Client;
const User = db.User;
const Tag = db.Tag;
const ProjectShare = db.ProjectShare;
const Collaboration = db.Collaboration;
const Transaction = db.Transaction;
const Platform = db.Platform;

/**
 * Função auxiliar para verificar permissão de acesso a um cliente
 */
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
      platformId, platformCommissionPercent, 
      ownerCommissionType, ownerCommissionValue, 
      ...restOfData 
  } = projectData;

  let finalClientId;
  if (isNewClient && newClientName) {
    if (newClientName.trim() === '') throw new Error("O nome do novo cliente não pode ser vazio.");
    const newClient = await Client.create({ legalName: newClientName, ownerId: ownerId });
    finalClientId = newClient.id;
  } else {
    if (!clientId) throw new Error("Cliente é obrigatório.");
    await checkClientPermission(clientId, ownerId);
    finalClientId = clientId;
  }

  if (!name) throw new Error("Nome do projeto é obrigatório.");

  const project = await Project.create({
    ...restOfData,
    name,
    clientId: finalClientId,
    ownerId,
    platformId: platformId || null,
    platformCommissionPercent: platformCommissionPercent || 0,
    ownerCommissionType: ownerCommissionType || null,
    ownerCommissionValue: ownerCommissionValue || 0,
    paymentDetails: {
        client: { status: 'unpaid', amountPaid: 0 },
        owner: { status: 'unpaid', amountReceived: 0 },
        partners: {}
    }
  });

  if (partnerId && commissionType && commissionValue != null) {
      const partner = await User.findByPk(partnerId);
      if (!partner) throw new Error("Parceiro de colaboração não encontrado.");
      await project.addPartner(partner, {
          through: { 
            commissionType, 
            commissionValue, 
            permissions: 'edit',
            paymentStatus: 'unpaid',
            amountPaid: 0.00
          } 
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
  const { status, priorityId, clientId, platformId, minBudget, maxBudget, sortBy, sortOrder, page = 1, limit = 6 } = filters;
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

  if (status && status !== 'all') {
    if (status === 'active') {
      whereConditions.status = { [Op.in]: ['in_progress', 'paused', 'draft'] };
    } else if (status === 'completed') {
      whereConditions.status = 'completed';
    }
  }
  
  if (priorityId && priorityId !== 'all' && priorityId !== '') {
      whereConditions.priorityId = parseInt(priorityId, 10);
  }
  if (clientId && clientId !== 'all' && clientId !== '') {
      whereConditions.clientId = parseInt(clientId, 10);
  }
  if (platformId && platformId !== 'all' && platformId !== '') {
      whereConditions.platformId = parseInt(platformId, 10);
  }
  
  if (minBudget && minBudget !== '') whereConditions.budget = { [Op.gte]: parseFloat(minBudget) };
  if (maxBudget && maxBudget !== '') {
      if (whereConditions.budget) {
          whereConditions.budget[Op.lte] = parseFloat(maxBudget);
      } else {
          whereConditions.budget = { [Op.lte]: parseFloat(maxBudget) };
      }
  }


  let orderClause = [['createdAt', 'DESC']]; // Padrão
  if (sortBy === 'budget') orderClause = [['budget', sortOrder === 'asc' ? 'ASC' : 'DESC']];
  if (sortBy === 'deadline') orderClause = [['deadline', sortOrder === 'asc' ? 'ASC' : 'DESC']];
  if (sortBy === 'name') orderClause = [['name', sortOrder === 'asc' ? 'ASC' : 'DESC']];


  const allFilteredProjects = await Project.findAll({ 
    where: whereConditions,
    include: [{ model: ProjectShare, as: 'ProjectShares', attributes: ['commissionType', 'commissionValue'] }] 
  });
  
  const summary = allFilteredProjects.reduce((acc, project) => {
    const budget = parseFloat(project.budget || 0);
    const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
    const platformFee = budget * (platformCommissionPercent / 100);

    let netAmountAfterPlatform = budget - platformFee;
    let totalPartnersCommissions = 0;

    project.ProjectShares?.forEach(share => {
        const partnerExpectedAmount = share.commissionType === 'percentage'
            ? netAmountAfterPlatform * (parseFloat(share.commissionValue) / 100)
            : parseFloat(share.commissionValue);
        totalPartnersCommissions += partnerExpectedAmount;
    });

    const ownerExpectedAmount = netAmountAfterPlatform - totalPartnersCommissions;

    acc.totalBudget += budget;
    acc.totalReceived += parseFloat(project.paymentDetails?.client?.amountPaid || 0);
    acc.totalToReceiveByOwner += ownerExpectedAmount;
    acc.totalReceivedByOwner += parseFloat(project.paymentDetails?.owner?.amountReceived || 0);

    return acc;
  }, { totalBudget: 0, totalReceived: 0, totalToReceiveByOwner: 0, totalReceivedByOwner: 0 });

  summary.remainingToReceiveByOwner = summary.totalToReceiveByOwner - summary.totalReceivedByOwner;


  const { count, rows: projects } = await Project.findAndCountAll({
    where: whereConditions,
    include: [
      { model: User, as: 'Owner', attributes: ['id', 'name'] },
      { model: Client, attributes: ['id', 'legalName', 'tradeName'] },
      { model: db.Priority, attributes: ['id', 'name', 'color'] },
      { model: Tag, through: { attributes: [] }, attributes: ['id', 'name'] },
      { model: User, as: 'Partners', attributes: ['id', 'name'], through: { model: ProjectShare, as: 'ProjectShare', attributes: ['commissionType', 'commissionValue', 'permissions', 'paymentStatus', 'amountPaid'] } },
      { model: Platform, as: 'AssociatedPlatform', attributes: ['id', 'name', 'logoUrl', 'defaultCommissionPercent'] },
      { model: ProjectShare, as: 'ProjectShares', attributes: ['commissionType', 'commissionValue', 'paymentStatus', 'amountPaid'] }
    ],
    order: orderClause,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    distinct: true
  });

  return {
    summary: {
        totalBudget: summary.totalBudget,
        totalReceived: summary.totalReceived,
        totalToReceive: summary.totalToReceiveByOwner,
        remainingToReceive: summary.remainingToReceiveByOwner
    },
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
        { model: User, as: 'Partners', attributes: ['id', 'name'], through: { model: ProjectShare, as: 'ProjectShare', attributes: ['commissionType', 'commissionValue', 'permissions', 'paymentStatus', 'amountPaid'] } },
        { model: Transaction, as: 'Transactions', order: [['paymentDate', 'DESC']] },
        { model: Platform, as: 'AssociatedPlatform', attributes: ['id', 'name', 'logoUrl'] },
        { model: ProjectShare, as: 'ProjectShares', attributes: ['commissionType', 'commissionValue', 'paymentStatus', 'amountPaid'] }
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
  const { tagIds, priorityId, partnerId, commissionType, commissionValue, ...restOfData } = updateData;

  const shareInfo = await ProjectShare.findOne({ where: { projectId, partnerId: userId } });
  const isOwner = project.ownerId === userId;
  const canEdit = isOwner || (shareInfo && shareInfo.permissions === 'edit');

  if (!canEdit) {
    throw new Error("Acesso negado. Você não tem permissão para editar este projeto.");
  }

  const finalPriorityId = priorityId === '' || priorityId === undefined ? null : parseInt(priorityId, 10);
  
  if (tagIds) {
    const tags = await Tag.findAll({ where: { id: tagIds, userId: project.ownerId } });
    await project.setTags(tags);
  }

  // --- Lógica para atualizar a comissão de parceria ---
  if (partnerId) { // Se um parceiro foi selecionado/mantido
      const existingPartnerShare = await ProjectShare.findOne({ where: { projectId: project.id, partnerId: partnerId } });
      if (existingPartnerShare) {
          await existingPartnerShare.update({ commissionType, commissionValue: parseFloat(commissionValue) });
      } else { // Se for um NOVO parceiro adicionado via edição
          const partner = await User.findByPk(partnerId);
          if (!partner) throw new Error("Parceiro de colaboração não encontrado.");
          await project.addPartner(partner, {
              through: { 
                commissionType, 
                commissionValue: parseFloat(commissionValue), 
                permissions: 'edit',
                paymentStatus: 'unpaid',
                amountPaid: 0.00
              } 
          });
      }
  } else if (!partnerId && project.Partners && project.Partners.length > 0) {
      // Se o parceiro foi removido (e havia um), remove a associação
      // Para múltiplos parceiros, o front-end precisaria gerenciar qual remover.
      for (const p of project.Partners) {
          await project.removePartner(p.id);
      }
  }

  await project.update({ ...restOfData, priorityId: finalPriorityId });
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
        where: { status: 'accepted', [Op.or]: [{ requesterId: ownerId, addresseeId: partner.id }, { requesterId: partner.id, addresseeId: owner.id }] }
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
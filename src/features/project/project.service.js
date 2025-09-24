const db = require('../../models');
const { Op } = require('sequelize');

const Project = db.Project;
const Client = db.Client;
const User = db.User;
const Tag = db.Tag;
const ProjectShare = db.ProjectShare;
const Collaboration = db.Collaboration;
const Transaction = db.Transaction;
const Platform = db.Platform; // Importar Platform

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
      partnerId, commissionType, commissionValue, // Comissão do PARCEIRO
      platformId, platformCommissionPercent, // Comissão da PLATAFORMA
      ownerCommissionType, ownerCommissionValue, // Comissão do DONO
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

  // Associa parceiro (se houver) e atualiza ProjectShare
  if (partnerId && commissionType && commissionValue != null) {
      const partner = await User.findByPk(partnerId);
      if (!partner) throw new Error("Parceiro de colaboração não encontrado.");
      await project.addPartner(partner, {
          through: { 
            commissionType, 
            commissionValue, 
            permissions: 'edit',
            paymentStatus: 'unpaid', // Valor padrão
            amountPaid: 0.00 // Valor padrão
          } 
      });
  }

  // Associa tags (se houver)
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
      whereConditions.status = { [Op.in]: ['in_progress', 'paused', 'draft'] };
    } else if (status === 'completed') {
      whereConditions.status = 'completed';
    }
  }
  if (priorityId) whereConditions.priorityId = priorityId;
  if (clientId) whereConditions.clientId = clientId;

  const allFilteredProjects = await Project.findAll({ where: whereConditions });
  
  const summary = allFilteredProjects.reduce((acc, project) => {
    acc.totalBudget += parseFloat(project.budget || 0);
    // Sumário de recebidos baseado apenas no cliente para consistência
    acc.totalReceived += parseFloat(project.paymentDetails?.client?.amountPaid || 0);
    return acc;
  }, { totalBudget: 0, totalReceived: 0 });
  summary.totalToReceive = summary.totalBudget - summary.totalReceived;

  const { count, rows: projects } = await Project.findAndCountAll({
    where: whereConditions,
    include: [
      { model: User, as: 'Owner', attributes: ['id', 'name'] },
      { model: Client, attributes: ['id', 'legalName', 'tradeName'] },
      { model: db.Priority, attributes: ['id', 'name', 'color'] },
      { model: Tag, through: { attributes: [] }, attributes: ['id', 'name'] },
      { model: User, as: 'Partners', attributes: ['id', 'name'], through: { model: ProjectShare, attributes: ['commissionType', 'commissionValue', 'permissions', 'paymentStatus', 'amountPaid'] } },
      { model: Platform, as: 'AssociatedPlatform', attributes: ['id', 'name', 'logoUrl'] } // Inclui a plataforma
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
        { model: User, as: 'Partners', attributes: ['id', 'name'], through: { model: ProjectShare, attributes: ['commissionType', 'commissionValue', 'permissions', 'paymentStatus', 'amountPaid'] } },
        { model: Transaction, as: 'Transactions', order: [['paymentDate', 'DESC']] },
        { model: Platform, as: 'AssociatedPlatform', attributes: ['id', 'name', 'logoUrl'] }, // Inclui a plataforma
        { model: db.ProjectShare, as: 'ProjectShares' } // Necessário para validação de acesso
    ]
  });
  if (!project) throw new Error("Projeto não encontrado.");
  const isOwner = project.ownerId === userId;
  const isPartner = project.Partners.some(p => p.id === userId); // Verifica se está na lista de Partners
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
  const { tagIds, priorityId, partnerId, commissionType, commissionValue, ...restOfData } = updateData; // Extrai dados de parceria para tratar separado

  // Validação de acesso para edição
  const shareInfo = await ProjectShare.findOne({ where: { projectId, partnerId: userId } });
  const isOwner = project.ownerId === userId;
  const canEdit = isOwner || (shareInfo && shareInfo.permissions === 'edit');
  if (!canEdit) {
    throw new Error("Acesso negado. Você não tem permissão para editar este projeto.");
  }

  // Garante que priorityId seja nulo se for uma string vazia ou undefined
  const finalPriorityId = priorityId === '' || priorityId === undefined ? null : parseInt(priorityId, 10);
  
  // Atualiza as tags
  if (tagIds) {
    const tags = await Tag.findAll({ where: { id: tagIds, userId: project.ownerId } });
    await project.setTags(tags);
  }

  // --- Lógica para atualizar a comissão de parceria (se mudou no formulário de edição) ---
  if (partnerId) { // Se um partnerId foi enviado, tenta atualizar ou adicionar
      const partnerShareEntry = await ProjectShare.findOne({ where: { projectId: project.id, partnerId: partnerId } });
      if (partnerShareEntry) {
          // Atualiza dados da ProjectShare existente
          await partnerShareEntry.update({ 
              commissionType: commissionType || partnerShareEntry.commissionType, 
              commissionValue: parseFloat(commissionValue) || partnerShareEntry.commissionValue 
          });
      } else {
          // Se o parceiro foi adicionado, cria a entrada de compartilhamento
          const partner = await User.findByPk(partnerId);
          if (!partner) throw new Error("Parceiro de colaboração não encontrado.");
          await project.addPartner(partner, {
              through: { 
                commissionType: commissionType || 'percentage', // Padrão se não informado
                commissionValue: parseFloat(commissionValue) || 0.00,
                permissions: 'edit',
                paymentStatus: 'unpaid',
                amountPaid: 0.00
              } 
          });
      }
  } else if (!partnerId && project.Partners && project.Partners.length > 0) {
      // Se o partnerId foi removido (e havia parceiros antes), remove todas as associações de parceiros.
      // Em um sistema real, o front-end deveria enviar qual parceiro remover especificamente.
      // Aqui, para simplicidade, se o partnerId do formData estiver vazio, removemos todos os parceiros existentes.
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
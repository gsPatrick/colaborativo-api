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
 * Função auxiliar para calcular os valores financeiros para um projeto específico
 * COM BASE NO USUÁRIO LOGADO (dono ou parceiro).
 * Retorna um objeto com os cálculos.
 * RECEBE A INSTÂNCIA DO PROJETO COM TODAS AS ASSOCIAÇÕES JÁ CARREGADAS.
 */
const calculateProjectFinancialsForUser = (projectInstance, currentUserId) => {
    // Garante que estamos trabalhando com um objeto "plain" do Sequelize
    // E que as associações como ProjectShares e Partners estão presentes
    const project = projectInstance.get({ plain: true });

    const budget = parseFloat(project.budget || 0);
    const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
    const platformFee = budget * (platformCommissionPercent / 100);

    let netAmountAfterPlatform = budget - platformFee;
    let totalPartnersCommissionsValue = 0; 
    let partnersCommissionsList = []; 

    // Calcula a soma das comissões de todos os parceiros para o cálculo do lucro do DONO
    project.Partners?.forEach(partner => {
        const share = project.ProjectShares?.find(ps => ps.partnerId === partner.id);
        if (share) {
            const partnerExpectedAmount = share.commissionType === 'percentage'
                ? netAmountAfterPlatform * (parseFloat(share.commissionValue) / 100)
                : parseFloat(share.commissionValue);
            totalPartnersCommissionsValue += partnerExpectedAmount;
            partnersCommissionsList.push({ ...partner, expectedAmount: partnerExpectedAmount.toFixed(2), shareDetails: share });
        }
    });

    const ownerExpectedProfit = netAmountAfterPlatform - totalPartnersCommissionsValue;

    let yourTotalToReceive = 0;
    let yourAmountReceived = 0;
    
    // Calcula os valores para o usuário logado
    if (project.ownerId === currentUserId) {
        yourTotalToReceive = ownerExpectedProfit;
        yourAmountReceived = parseFloat(project.paymentDetails?.owner?.amountReceived || 0);
    } else { // Se o usuário logado for um PARCEIRO
        const userAsPartner = project.Partners?.find(p => p.id === currentUserId);
        if (userAsPartner) {
            const partnerShare = project.ProjectShares?.find(ps => ps.partnerId === currentUserId);
            if (partnerShare) {
                if (partnerShare.commissionType === 'percentage') {
                    yourTotalToReceive = netAmountAfterPlatform * (parseFloat(partnerShare.commissionValue) / 100);
                } else if (partnerShare.commissionType === 'fixed') {
                    yourTotalToReceive = parseFloat(partnerShare.commissionValue);
                }
                yourAmountReceived = parseFloat(partnerShare.amountPaid || 0);
            }
        }
    }
    const yourRemainingToReceive = yourTotalToReceive - yourAmountReceived;

    return {
        yourTotalToReceive: yourTotalToReceive.toFixed(2),
        yourAmountReceived: yourAmountReceived.toFixed(2),
        yourRemainingToReceive: yourRemainingToReceive.toFixed(2),
        platformFee: platformFee.toFixed(2),
        netAmountAfterPlatform: netAmountAfterPlatform.toFixed(2),
        partnersCommissionsList: partnersCommissionsList
    };
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
    platformId: platformId === '' ? null : parseInt(platformId, 10),
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

  if (status && status !== 'all') { /* ... */ }
  if (priorityId && priorityId !== 'all' && priorityId !== '') { /* ... */ }
  if (clientId && clientId !== 'all' && clientId !== '') { /* ... */ }
  if (platformId && platformId !== 'all' && platformId !== '') { /* ... */ }
  if (minBudget && minBudget !== '') whereConditions.budget = { [Op.gte]: parseFloat(minBudget) };
  if (maxBudget && maxBudget !== '') { /* ... */ }


  let orderClause = [['createdAt', 'DESC']]; /* ... */


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

  // --- CORREÇÃO AQUI: ANEXA OS CÁLCULOS FINANCEIROS A CADA PROJETO ---
  const projectsWithFinancials = projects.map(project => {
      // Passa a instância do projeto e o userId para calcular os financials para CADA PROJETO
      const financials = calculateProjectFinancialsForUser(project, userId);
      return { ...project.get({ plain: true }), ...financials }; // Garante que seja um objeto plano para o frontend
  });

  // Recalcula o sumário FINAL baseado nos projectsWithFinancials
  const summary = projectsWithFinancials.reduce((acc, project) => {
    acc.totalBudget += parseFloat(project.budget || 0);
    acc.totalReceived += parseFloat(project.paymentDetails?.client?.amountPaid || 0);
    acc.totalToReceive += parseFloat(project.yourTotalToReceive || 0);
    acc.totalReceivedByOwner += parseFloat(project.yourAmountReceived || 0);
    return acc;
  }, { totalBudget: 0, totalReceived: 0, totalToReceive: 0, totalReceivedByOwner: 0 });
  
  summary.remainingToReceive = summary.totalToReceive - summary.totalReceivedByOwner;


  return {
    summary: {
        totalBudget: summary.totalBudget,
        totalReceived: summary.totalReceived, // Total recebido do cliente (que vai para o ProjectCard)
        totalToReceive: summary.totalToReceive, // Seu Líquido a Receber (que vai para o ProjectCard)
        remainingToReceive: summary.remainingToReceive // Seu Líquido Restante (que vai para o ProjectCard)
    },
    pagination: {
      totalProjects: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page, 10)
    },
    projects: projectsWithFinancials // Retorna os projetos com os cálculos anexados
  };
};

/**
 * Busca um projeto pelo ID, validando a permissão do usuário.
 * AGORA TAMBÉM INCLUI OS CÁLCULOS FINANCEIROS PARA O USUÁRIO LOGADO.
 */
exports.findProjectById = async (projectId, userId) => {
  const projectInstance = await Project.findByPk(projectId, {
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
  if (!projectInstance) throw new Error("Projeto não encontrado.");
  const isOwner = projectInstance.ownerId === userId;
  const isPartner = projectInstance.Partners.some(p => p.id === userId);
  if (!isOwner && !isPartner) {
    throw new Error("Acesso negado. Você não tem permissão para ver este projeto.");
  }

  // --- CORREÇÃO AQUI: ANEXA OS CÁLCULOS FINANCEIROS AO PROJETO ÚNICO ---
  const financials = calculateProjectFinancialsForUser(projectInstance, userId);
  return { ...projectInstance.get({ plain: true }), ...financials }; // Garante que seja um objeto plano para o frontend
};

/**
 * Atualiza um projeto.
 */
exports.updateProject = async (projectId, updateData, userId) => {
  const projectInstance = await Project.findByPk(projectId, { 
      include: [
          { model: User, as: 'Partners', through: { model: ProjectShare, as: 'ProjectShare' } },
          { model: ProjectShare, as: 'ProjectShares' }
      ]
  });

  if (!projectInstance) throw new Error("Projeto não encontrado.");

  const shareInfo = projectInstance.ProjectShares?.find(ps => ps.partnerId === userId);
  const isOwner = projectInstance.ownerId === userId;
  const canEdit = isOwner || (shareInfo && shareInfo.permissions === 'edit');

  if (!canEdit) {
    throw new Error("Acesso negado. Você não tem permissão para editar este projeto.");
  }

  const { tagIds, priorityId, partnerId, commissionType, commissionValue, ...restOfData } = updateData;

  const finalPriorityId = priorityId === '' || priorityId === undefined ? null : parseInt(priorityId, 10);
  
  if (tagIds) {
    const tags = await Tag.findAll({ where: { id: tagIds, userId: projectInstance.ownerId } });
    await projectInstance.setTags(tags);
  }

  if (partnerId) {
      const existingPartnerShare = await ProjectShare.findOne({ where: { projectId: projectInstance.id, partnerId: partnerId } });
      if (existingPartnerShare) {
          await existingPartnerShare.update({ commissionType, commissionValue: parseFloat(commissionValue) });
      } else {
          const partner = await User.findByPk(partnerId);
          if (!partner) throw new Error("Parceiro de colaboração não encontrado.");
          await projectInstance.addPartner(partner, {
              through: { 
                commissionType, 
                commissionValue: parseFloat(commissionValue), 
                permissions: 'edit',
                paymentStatus: 'unpaid',
                amountPaid: 0.00
              } 
          });
      }
  } else if (!partnerId && projectInstance.Partners && projectInstance.Partners.length > 0) {
      for (const p of projectInstance.Partners) {
          await projectInstance.removePartner(p.id);
      }
  }

  await projectInstance.update({ ...restOfData, priorityId: finalPriorityId });
  return this.findProjectById(projectId, userId);
};

/**
 * Registra um valor como recebido pelo usuário logado (dono ou parceiro).
 */
exports.registerUserReceipt = async (projectId, userId, amount, isFullPayment = false) => {
    const t = await db.sequelize.transaction();
    try {
        const project = await Project.findByPk(projectId, { 
            include: [
                { model: ProjectShare, as: 'ProjectShares' },
                { model: User, as: 'Partners', through: { model: ProjectShare, as: 'ProjectShare' } }
            ] 
        });
        if (!project) throw new Error("Projeto não encontrado.");

        const isOwner = project.ownerId === userId;
        const partnerShareEntry = project.ProjectShares?.find(ps => ps.partnerId === userId);

        if (!isOwner && !partnerShareEntry) {
            throw new Error("Acesso negado. Você não é o dono nem um parceiro deste projeto.");
        }

        let updatedPaymentDetails = { ...project.paymentDetails };

        // --- LÓGICA DE ATUALIZAÇÃO DO RECEBIMENTO DO USUÁRIO ---
        if (isOwner) {
            const financials = calculateProjectFinancialsForUser(project, userId);
            const currentReceived = parseFloat(updatedPaymentDetails.owner.amountReceived || 0);
            const totalToReceive = parseFloat(financials.yourTotalToReceive);
            
            let newAmountReceived = currentReceived + parseFloat(amount || 0);
            if (isFullPayment) newAmountReceived = totalToReceive;

            updatedPaymentDetails.owner.amountReceived = newAmountReceived.toFixed(2);
            updatedPaymentDetails.owner.status = newAmountReceived >= totalToReceive ? 'paid' : 'partial';

        } else if (partnerShareEntry) { // É um parceiro
            const financials = calculateProjectFinancialsForUser(project, userId);
            const currentReceived = parseFloat(partnerShareEntry.amountPaid || 0);
            const totalToReceive = parseFloat(financials.yourTotalToReceive);

            let newAmountReceived = currentReceived + parseFloat(amount || 0);
            if (isFullPayment) newAmountReceived = totalToReceive;

            await partnerShareEntry.update({
                amountPaid: newAmountReceived.toFixed(2),
                paymentStatus: newAmountReceived >= totalToReceive ? 'paid' : 'partial'
            }, { transaction: t });

            // Atualiza também no paymentDetails.partners do projeto principal
            updatedPaymentDetails.partners = {
                ...updatedPaymentDetails.partners,
                [userId]: { 
                    status: newAmountReceived >= totalToReceive ? 'paid' : 'partial', 
                    amountReceived: newAmountReceived.toFixed(2) 
                }
            };
        }

        await project.update({ paymentDetails: updatedPaymentDetails }, { transaction: t });
        await t.commit();
        return this.findProjectById(projectId, userId);
    } catch (error) {
        await t.rollback();
        throw error;
    }
};
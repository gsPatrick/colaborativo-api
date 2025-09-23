const db = require('../../models');
const { Op, Sequelize } = require('sequelize');

const Client = db.Client;
const User = db.User;
const Collaboration = db.Collaboration;
const ClientShare = db.ClientShare;
const Project = db.Project; // <-- LINHA CORRIGIDA/ADICIONADA

/**
 * Cria um novo cliente associado ao usuário logado.
 */
exports.createClient = async (clientData, ownerId) => {
  // --- CORREÇÃO AQUI ---
  // A validação agora é no campo `legalName`.
  if (!clientData.legalName) {
    throw new Error("A Razão Social (ou nome completo) do cliente é obrigatória.");
  }
  
  const client = await Client.create({
    ...clientData,
    ownerId: ownerId,
  });
  
  return client;
};


/**
 * Lista todos os clientes para um usuário com dados agregados de projetos.
 */
exports.findAllClientsForUser = async (userId) => {
  const clientsData = await Client.findAll({
    where: {
      [Op.or]: [
        { ownerId: userId },
        { '$SharedWith.id$': userId }
      ]
    },
    include: [
      { model: User, as: 'Owner', attributes: ['id', 'name'] },
      { model: User, as: 'SharedWith', attributes: ['id', 'name'], through: { attributes: [] } },
      { 
        model: Project, 
        as: 'Projects',
        attributes: ['id', 'name', 'status', 'budget'], // Inclui budget para cálculo no front
        where: { ownerId: userId },
        required: false 
      }
    ],
    distinct: true,
    order: [['legalName', 'ASC']]
  });

  if (clientsData.length === 0) return [];

  const clientIds = clientsData.map(c => c.id);
  const projectAggregates = await Project.findAll({
    where: { 
      clientId: { [Op.in]: clientIds },
      ownerId: userId 
    },
    attributes: [
      'clientId',
      [Sequelize.fn('COUNT', Sequelize.col('id')), 'projectCount'],
      [Sequelize.fn('SUM', Sequelize.col('budget')), 'totalBilled'],
      [Sequelize.fn('SUM', Sequelize.cast(Sequelize.json('paymentDetails.clientAmountPaid'), 'numeric')), 'totalReceived']
    ],
    group: ['clientId'],
    raw: true
  });

  const aggregatesMap = new Map(projectAggregates.map(agg => [agg.clientId, agg]));

  return clientsData.map(client => {
    const clientPlain = client.get({ plain: true });
    const aggregates = aggregatesMap.get(client.id) || { projectCount: 0, totalBilled: 0, totalReceived: 0 };
    return {
      ...clientPlain,
      projectCount: aggregates.projectCount,
      totalBilled: aggregates.totalBilled,
      totalReceived: aggregates.totalReceived,
    };
  });
};


/**
 * Busca um cliente específico pelo ID, verificando a permissão do usuário.
 */
exports.findClientById = async (clientId, userId) => {
  const client = await Client.findByPk(clientId, {
    include: [
      { model: User, as: 'Owner', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'SharedWith', attributes: ['id', 'name', 'email'], through: { attributes: [] } },
      // --- INCLUI PROJETOS ANINHADOS TAMBÉM AQUI ---
      { 
        model: Project, 
        as: 'Projects',
        attributes: ['id', 'name', 'status', 'budget', 'deadline', 'paymentDetails'], 
        where: { ownerId: userId }, 
        required: false 
      }
    ]
  });

  if (!client) {
    throw new Error("Cliente não encontrado.");
  }

  const isOwner = client.ownerId === userId;
  const isSharedWith = client.SharedWith.some(user => user.id === userId);

  if (!isOwner && !isSharedWith) {
    throw new Error("Acesso negado. Você não tem permissão para ver este cliente.");
  }
  
  // Calcula dados agregados para o cliente único
  const totalBilled = client.Projects ? client.Projects.reduce((sum, p) => sum + parseFloat(p.budget || 0), 0) : 0;
  const totalReceived = client.Projects ? client.Projects.reduce((sum, p) => sum + parseFloat(p.paymentDetails?.clientAmountPaid || 0), 0) : 0;
  const projectCount = client.Projects ? client.Projects.length : 0;

  return {
    ...client.get({ plain: true }),
    totalBilled,
    totalReceived,
    projectCount
  };
};

/**
 * Atualiza um cliente. Apenas o dono pode atualizar.
 */
exports.updateClient = async (clientId, updateData, userId) => {
  const client = await Client.findByPk(clientId);
  if (!client) {
    throw new Error("Cliente não encontrado.");
  }
  if (client.ownerId !== userId) {
    throw new Error("Acesso negado. Apenas o proprietário pode editar o cliente.");
  }
  await client.update(updateData);
  return client;
};

/**
 * Deleta um cliente. Apenas o dono pode deletar.
 */
exports.deleteClient = async (clientId, userId) => {
  const client = await Client.findByPk(clientId);
  if (!client) {
    throw new Error("Cliente não encontrado.");
  }
  if (client.ownerId !== userId) {
    throw new Error("Acesso negado. Apenas o proprietário pode deletar o cliente.");
  }
  await client.destroy();
  return { message: "Cliente deletado com sucesso." };
};

/**
 * Compartilha um cliente com um colaborador aceito.
 */
exports.shareClientWithPartner = async (clientId, ownerId, partnerEmail) => {
  const client = await Client.findByPk(clientId);
  if (!client || client.ownerId !== ownerId) {
    throw new Error("Cliente não encontrado ou você não é o proprietário.");
  }
  const partner = await User.findOne({ where: { email: partnerEmail } });
  if (!partner) {
    throw new Error("Colaborador não encontrado.");
  }
  if (partner.id === ownerId) {
    throw new Error("Você não pode compartilhar um cliente consigo mesmo.");
  }
  const collaboration = await Collaboration.findOne({
    where: {
      status: 'accepted',
      [Op.or]: [
        { requesterId: ownerId, addresseeId: partner.id },
        { requesterId: partner.id, addresseeId: ownerId }
      ]
    }
  });
  if (!collaboration) {
    throw new Error("Você só pode compartilhar clientes com colaboradores aceitos.");
  }
  await client.addSharedWith(partner);
  return { message: `Cliente compartilhado com ${partner.name}.` };
};

/**
 * Remove o compartilhamento de um cliente com um usuário.
 */
exports.stopSharingClient = async (clientId, ownerId, partnerId) => {
  const client = await Client.findByPk(clientId);
  if (!client || client.ownerId !== ownerId) {
    throw new Error("Cliente não encontrado ou você não é o proprietário.");
  }
  const partner = await User.findByPk(partnerId);
  if (!partner) {
    throw new Error("Colaborador não encontrado.");
  }
  const result = await client.removeSharedWith(partner);
  if (result === 0) {
      throw new Error("Este cliente não estava compartilhado com o usuário especificado.");
  }
  return { message: `Compartilhamento com ${partner.name} removido.` };
};
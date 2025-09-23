const db = require('../../models');
const { Op } = require('sequelize');
const Collaboration = db.Collaboration;
const User = db.User;

// Serviço para criar a solicitação
exports.createCollaborationRequest = async (requesterId, addresseeEmail) => {
  const addressee = await User.findOne({ where: { email: addresseeEmail } });

  if (!addressee) {
    throw new Error("Usuário convidado não encontrado.");
  }

  if (requesterId === addressee.id) {
    throw new Error("Você não pode enviar um convite para si mesmo.");
  }
  
  // Verifica se já existe uma colaboração (em qualquer direção)
  const existingCollaboration = await Collaboration.findOne({
    where: {
      [Op.or]: [
        { requesterId: requesterId, addresseeId: addressee.id },
        { requesterId: addressee.id, addresseeId: requesterId }
      ]
    }
  });

  if (existingCollaboration) {
    throw new Error("Já existe uma solicitação ou colaboração ativa com este usuário.");
  }

  return Collaboration.create({ requesterId, addresseeId: addressee.id });
};

// Serviço para buscar as colaborações de um usuário
exports.findUserCollaborations = async (userId, status) => {
    if (!userId) throw new Error("ID do usuário é obrigatório.");

    const whereClause = {
        [Op.or]: [{ requesterId: userId }, { addresseeId: userId }]
    };

    if (status) {
        whereClause.status = status;
    }

    return Collaboration.findAll({
        where: whereClause,
        include: [ // Inclui os dados dos usuários para exibir na tela
            { model: User, as: 'Requester', attributes: ['id', 'name', 'email', 'label'] },
            { model: User, as: 'Addressee', attributes: ['id', 'name', 'email', 'label'] }
        ]
    });
}

// Serviço para atualizar o status (aceitar/recusar)
exports.updateCollaborationStatus = async (collaborationId, addresseeId, newStatus) => {
    if (newStatus !== 'accepted' && newStatus !== 'declined') {
        throw new Error("Status inválido. Use 'accepted' ou 'declined'.");
    }

    const collaboration = await Collaboration.findByPk(collaborationId);
    if (!collaboration) {
        throw new Error("Solicitação não encontrada.");
    }
    
    // Validação de segurança CRÍTICA: só quem recebeu o convite pode aceitar/recusar.
    if (collaboration.addresseeId !== addresseeId) {
        throw new Error("Permissão negada. Apenas o destinatário pode alterar o status.");
    }

    if (collaboration.status !== 'pending') {
        throw new Error(`Esta solicitação não está mais pendente (status atual: ${collaboration.status}).`);
    }

    collaboration.status = newStatus;
    await collaboration.save();
    return collaboration;
}

// Serviço para cancelar (se pendente) ou revogar (se aceita)
exports.cancelOrRevokeCollaboration = async (collaborationId, userId) => {
    const collaboration = await Collaboration.findByPk(collaborationId);
    if (!collaboration) {
        throw new Error("Solicitação/Colaboração não encontrada.");
    }
    
    // Se estiver pendente, apenas quem enviou pode cancelar
    if (collaboration.status === 'pending' && collaboration.requesterId !== userId) {
        throw new Error("Permissão negada. Apenas quem enviou a solicitação pode cancelá-la.");
    }

    // Se estiver aceita, qualquer uma das partes pode revogar
    if (collaboration.status === 'accepted' && (collaboration.requesterId !== userId && collaboration.addresseeId !== userId)) {
        throw new Error("Permissão negada. Você não faz parte desta colaboração.");
    }

    // A lógica pode ser deletar ou mudar o status para 'revoked'/'canceled'. Mudar é melhor para auditoria.
    const newStatus = collaboration.status === 'pending' ? 'canceled' : 'revoked';
    collaboration.status = newStatus;

    await collaboration.save();
    // Ou para deletar: await collaboration.destroy();
}
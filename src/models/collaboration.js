'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Collaboration extends Model {
    static associate(models) {
      // Uma colaboração pertence a dois usuários: o que enviou o convite e o que recebeu.
      // Usamos 'as' (alias) porque estamos associando o mesmo model (User) duas vezes.
      this.belongsTo(models.User, {
        as: 'Requester', // Alias para o solicitante
        foreignKey: 'requesterId',
      });
      this.belongsTo(models.User, {
        as: 'Addressee', // Alias para o destinatário (convidado)
        foreignKey: 'addresseeId',
      });
    }
  }
  Collaboration.init({
    // ID do usuário que enviou o convite
    requesterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // ID do usuário que recebeu o convite
    addresseeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // Status do convite/colaboração
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'declined', 'revoked'),
      allowNull: false,
      defaultValue: 'pending'
    }
  }, {
    sequelize,
    modelName: 'Collaboration',
    tableName: 'collaborations',
    // Garante que não exista mais de um convite pendente/aceito para o mesmo par de usuários
    indexes: [
      {
        unique: true,
        fields: ['requesterId', 'addresseeId']
      }
    ]
  });
  return Collaboration;
};
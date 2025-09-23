'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Client extends Model {
    static associate(models) {
      // Um cliente pertence a uma conta "dona" (Owner)
      this.belongsTo(models.User, {
        as: 'Owner',
        foreignKey: 'ownerId',
      });
      
      // Um cliente pode ter vários projetos
      this.hasMany(models.Project, {
        foreignKey: 'clientId',
        onDelete: 'CASCADE',
      });

      // --- CORREÇÃO DEFINITIVA: Usa o modelo explícito ---
      this.belongsToMany(models.User, {
        through: models.ClientShare,
        as: 'SharedWith',
        foreignKey: 'clientId',
      });
    }
  }
  Client.init({
    ownerId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    legalName: { type: DataTypes.STRING, allowNull: false },
    tradeName: DataTypes.STRING,
    cnpj: DataTypes.STRING,
    inscricaoEstadual: DataTypes.STRING,
    inscricaoMunicipal: DataTypes.STRING,
    contactName: DataTypes.STRING,
    contactEmail: DataTypes.STRING,
    contactPhone: DataTypes.STRING,
    fiscalEmail: DataTypes.STRING,
    addressStreet: DataTypes.STRING,
    addressNumber: DataTypes.STRING,
    addressComplement: DataTypes.STRING,
    addressNeighborhood: DataTypes.STRING,
    addressCity: DataTypes.STRING,
    addressState: DataTypes.STRING,
    addressZipCode: DataTypes.STRING,
    notes: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Client',
    tableName: 'clients'
  });
  return Client;
};
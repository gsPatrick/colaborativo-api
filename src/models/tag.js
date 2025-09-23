'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Tag extends Model {
    static associate(models) {
      // Tags podem ser globais ou por usuário. Vamos fazer por usuário.
      this.belongsTo(models.User, {
        foreignKey: 'userId',
      });

      this.belongsToMany(models.Project, {
        through: models.ProjectTag,
        foreignKey: 'tagId',
      });
    }
  }
  Tag.init({
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false, // Garante que a tag pertence a uma conta
      references: { model: 'users', key: 'id' }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Tag',
    tableName: 'tags',
    indexes: [{ unique: true, fields: ['userId', 'name'] }] // A mesma tag não pode existir duas vezes para o mesmo usuário
  });
  return Tag;
};
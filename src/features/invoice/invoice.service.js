const axios = require('axios');
const db = require('../../models');
const User = db.User;
const Project = db.Project;
const Client = db.Client;
const Invoice = db.Invoice;

exports.createInvoiceForProject = async (projectId, userId) => {
    // 1. Buscar todos os dados necessários do seu banco
    const user = await User.findByPk(userId);
    const project = await Project.findByPk(projectId, { include: [Client] });

    if (!project || project.ownerId !== userId) {
        throw new Error("Projeto não encontrado ou acesso negado.");
    }
    if (!user.enotasCompanyId || !user.enotasApiKey) {
        throw new Error("Credenciais do eNotas não configuradas no seu perfil.");
    }

    // 2. Montar o payload para a API do eNotas
    const payload = {
        cliente: {
            nome: project.Client.legalName,
            email: project.Client.fiscalEmail || project.Client.contactEmail,
            cpfCnpj: project.Client.cnpj.replace(/\D/g, ''), // Envia apenas números
            endereco: {
                logradouro: project.Client.addressStreet,
                numero: project.Client.addressNumber,
                bairro: project.Client.addressNeighborhood,
                cep: project.Client.addressZipCode,
                cidade: project.Client.addressCity,
                uf: project.Client.addressState,
            }
        },
        servico: {
            descricao: `Serviços prestados referentes ao projeto: ${project.name}`,
            valor: parseFloat(project.budget)
        }
    };

    // 3. Fazer a chamada para a API do eNotas
    try {
        const response = await axios.post(
            `https://api.enotasgw.com.br/v1/empresas/${user.enotasCompanyId}/nfes`,
            payload,
            { headers: { 'Authorization': `Bearer ${user.enotasApiKey}` } }
        );

        const nfeData = response.data;

        // 4. Salvar o resultado no seu banco de dados
        const newInvoice = await Invoice.create({
            userId,
            projectId,
            enotasId: nfeData.id,
            status: nfeData.status,
            number: nfeData.numero,
            serie: nfeData.serie,
            pdfUrl: nfeData.linkNfe, // Exemplo, ajuste conforme a resposta real
            xmlUrl: nfeData.linkNfeXml, // Exemplo
        });

        return newInvoice;

    } catch (error) {
        console.error("Erro na API do eNotas:", error.response?.data);
        throw new Error(error.response?.data?.mensagem || "Falha ao emitir a nota fiscal.");
    }
};
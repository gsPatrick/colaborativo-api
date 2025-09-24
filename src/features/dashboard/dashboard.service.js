const db = require('../../models');
const { Op, Sequelize } = require('sequelize');
const { startOfMonth, endOfMonth, subMonths } = require('date-fns');

const Project = db.Project;
const Client = db.Client;
const Transaction = db.Transaction;
const ProjectShare = db.ProjectShare;
const Expense = db.Expense; // Importar o modelo de Despesa

/**
 * Lógica de cálculo de lucro baseada em transações.
 */
async function calculateReceivedInPeriod(userId, startDate, endDate) {
    const result = await Transaction.findOne({
        attributes: [
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalReceived']
        ],
        include: [{
            model: Project,
            attributes: [],
            where: { ownerId: userId } // Considera apenas transações de projetos que o usuário é dono
        }],
        where: {
            paymentDate: {
                [Op.between]: [startDate, endDate]
            }
        },
        raw: true
    });
    return parseFloat(result.totalReceived) || 0;
}

/**
 * NOVA FUNÇÃO AUXILIAR: Calcula o total de despesas em um período.
 */
async function calculateExpensesInPeriod(userId, startDate, endDate) {
    const result = await Expense.findOne({
        attributes: [
            [Sequelize.fn('SUM', Sequelize.col('amount')), 'totalExpenses']
        ],
        where: {
            userId: userId, // Despesas são sempre do usuário que as registrou
            expenseDate: {
                [Op.between]: [startDate, endDate]
            }
        },
        raw: true
    });
    return parseFloat(result.totalExpenses) || 0;
}


/**
 * Calcula os dados consolidados do dashboard para o usuário.
 */
exports.getDashboardData = async (userId) => {
    // --- PASSO 1: OBTER IDs DE PROJETOS RELEVANTES ---
    // Encontra os IDs dos projetos onde o usuário é parceiro.
    const sharedProjectShares = await ProjectShare.findAll({
        where: { partnerId: userId },
        attributes: ['projectId']
    });
    const sharedProjectIds = sharedProjectShares.map(share => share.projectId);

    // Cláusula WHERE principal para buscar projetos onde o usuário é dono OU parceiro.
    const mainWhereClause = {
        [Op.or]: [
            { ownerId: userId },
            { id: { [Op.in]: sharedProjectIds } }
        ]
    };

    // --- 2. CÁLCULO FINANCEIRO (Total do Orçamento e Saldo a Receber) ---
    // Busca TODOS os projetos relevantes para somar orçamentos e pagamentos totais.
    const allProjects = await Project.findAll({ 
        where: mainWhereClause,
        include: [{ model: ProjectShare, as: 'ProjectShares' }] // Inclui para acessar dados de parceria
    });
    
    let totalBudget = 0;
    let totalPaidToUser = 0; // O que o *usuário logado* já recebeu
    
    for (const project of allProjects) {
        totalBudget += parseFloat(project.budget || 0);

        // Se o usuário logado for o dono do projeto
        if (project.ownerId === userId) {
            totalPaidToUser += parseFloat(project.paymentDetails?.client?.amountPaid || 0);
        } else { // Se o usuário logado for um parceiro
            const userShare = project.ProjectShares.find(share => share.partnerId === userId);
            if (userShare) {
                totalPaidToUser += parseFloat(userShare.amountPaid || 0);
            }
        }
    }
    const remainingToReceive = totalBudget - totalPaidToUser;


    // --- 3. LUCRO LÍQUIDO DO MÊS ATUAL (Baseado em Receitas - Despesas do período) ---
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    
    const totalReceivedInCurrentMonth = await calculateReceivedInPeriod(userId, currentMonthStart, now);
    const totalExpensesInCurrentMonth = await calculateExpensesInPeriod(userId, currentMonthStart, now);
    
    // Lucro líquido real do mês atual: Receitas do período - Despesas do período
    const netProfitMonth = totalReceivedInCurrentMonth - totalExpensesInCurrentMonth;


    // --- 4. LISTA DE PROJETOS ATIVOS ---
    const activeProjectsList = await Project.findAll({
        where: {
            ...mainWhereClause,
            status: { [Op.in]: ['in_progress', 'paused'] }
        },
        order: [['createdAt', 'DESC']],
        limit: 10,
        attributes: ['id', 'name']
    });


    // --- 5. PRÓXIMOS PRAZOS ---
    // Prazos geralmente são responsabilidade do dono do projeto, ou do parceiro com permissão específica.
    // Aqui, focamos em projetos onde o userId é o owner.
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);
    const upcomingDeadlines = await Project.findAll({
        where: {
            ownerId: userId, // Foco em prazos de projetos próprios
            status: { [Op.in]: ['in_progress', 'paused'] },
            deadline: { [Op.between]: [now, sevenDaysFromNow] }
        },
        order: [['deadline', 'ASC']],
        limit: 5,
        attributes: ['id', 'name', 'deadline']
    });


    // --- 6. PROJETOS CONCLUÍDOS RECENTEMENTE (Cálculo de Lucro Preciso) ---
    const recentCompletedProjectsData = await Project.findAll({
        where: {
            ...mainWhereClause,
            status: 'completed'
        },
        include: [
            { model: Client, attributes: ['legalName', 'tradeName'] },
            { model: ProjectShare, as: 'ProjectShares', where: { partnerId: userId }, required: false } // Inclui ProjectShare se o user for parceiro
        ],
        order: [['updatedAt', 'DESC']],
        limit: 5,
    });
    
    const recentCompletedProjects = recentCompletedProjectsData.map(project => {
        const budget = parseFloat(project.budget || 0);
        const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);
        const platformFee = budget * (platformCommissionPercent / 100);
        
        let profit = 0;
        // Se o usuário logado é o dono do projeto
        if (project.ownerId === userId) {
            const ownerCommissionValue = parseFloat(project.ownerCommissionValue || 0); // Considera comissão do dono
            // Lucro do dono: Orçamento - Taxa Plataforma - Comissão para parceiros - Comissão do dono
            // (Assumimos aqui que ownerCommissionValue é o valor que o dono RECEBE, não o que ele PAGA)
            // Lógica mais precisa: ownerProfit = budget - platformFee - sum(partnerCommissions)
            // Por simplicidade aqui, vamos usar o valor bruto - taxas e assumir que o ownerCommissionValue
            // representa a margem dele ou a parte do faturamento dele.
            // Para ser 100% preciso, precisaríamos somar os amounts das transações do owner.
            profit = budget - platformFee; // Simplificado para o que o projeto rendeu antes de repasses internos
            // Se o projeto tiver parceiros, o dono repassa.
            // Para calcular o lucro LÍQUIDO do DONO de um projeto CONCLUÍDO, é:
            // total_recebido_do_cliente - taxas_plataforma - repasses_aos_parceiros
            // O dashboard está pedindo "lucro", que pode ser o "lucro bruto do projeto antes de repasses".
            // Para o "lucro líquido do dev/agência para o projeto específico":
            let netProfitForThisProject = 0;
            if (project.ownerId === userId) { // Se o usuário é o dono
                const totalPartnerCommissions = project.ProjectShares
                    ? project.ProjectShares.reduce((sum, share) => sum + parseFloat(share.commissionValue || 0), 0)
                    : 0;
                netProfitForThisProject = budget - platformFee - totalPartnerCommissions;
            } else { // Se o usuário é um parceiro
                const userShare = project.ProjectShares?.find(share => share.partnerId === userId);
                if (userShare) {
                    netProfitForThisProject = parseFloat(userShare.commissionValue || 0);
                }
            }
            profit = netProfitForThisProject;

        } else { // Se o usuário logado é um parceiro no projeto
            const userShare = project.ProjectShares?.find(share => share.partnerId === userId);
            if (userShare) {
                // O lucro do parceiro é a comissão definida para ele
                profit = parseFloat(userShare.commissionValue || 0);
            }
        }

        return { 
            id: project.id, 
            name: project.name, 
            client: project.Client ? (project.Client.tradeName || project.Client.legalName) : 'N/A',
            profit: profit 
        };
    });


    // --- 7. DADOS PARA O GRÁFICO (Lucro Líquido Real por Mês) ---
    const profitChartData = [];
    for (let i = 5; i >= 0; i--) {
        const date = subMonths(now, i);
        const monthStart = startOfMonth(date);
        const monthEnd = endOfMonth(date);
        const monthName = monthStart.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');
        
        const totalReceivedInMonth = await calculateReceivedInPeriod(userId, monthStart, monthEnd);
        const totalExpensesInMonth = await calculateExpensesInPeriod(userId, monthStart, monthEnd);
        
        profitChartData.push({ name: monthName, lucro: totalReceivedInMonth - totalExpensesInMonth });
    }

    return {
        netProfitMonth, // Já é o lucro líquido real
        totalToReceive: totalBudget, // Total de todos os orçamentos de projetos relevantes
        remainingToReceive, // Saldo que falta receber do cliente/parceiro
        activeProjects: activeProjectsList,
        upcomingDeadlines,
        recentCompletedProjects,
        profitChartData
    };
};
const invoiceService = require('./invoice.service');

/**
 * Controller para criar/emitir uma nova fatura para um projeto.
 */
exports.create = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id; // Vem do authMiddleware

    const invoice = await invoiceService.createInvoiceForProject(projectId, userId);
    res.status(201).json(invoice);
  } catch (error) {
    // Retorna um status code apropriado dependendo do erro
    const statusCode = error.message.includes("Credenciais") ? 400 : 500;
    res.status(statusCode).json({ message: "Erro ao emitir nota fiscal", error: error.message });
  }
};

/**
 * Controller para listar todas as faturas de um projeto.
 */
exports.findAllByProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.id;

        const invoices = await invoiceService.findInvoicesByProject(projectId, userId);
        res.status(200).json(invoices);
    } catch (error) {
        res.status(400).json({ message: "Erro ao buscar faturas", error: error.message });
    }
};

/**
 * Controller para buscar uma fatura específica.
 */
exports.findOne = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const userId = req.user.id;

        const invoice = await invoiceService.findInvoiceById(invoiceId, userId);
        res.status(200).json(invoice);
    } catch (error) {
        res.status(404).json({ message: "Erro ao buscar fatura", error: error.message });
    }
};
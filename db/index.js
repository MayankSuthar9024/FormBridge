const localAdapter = require("./localAdapter");

// In the future or when DATABASE_URL is set, we can attach a Postgres adapter here.
let activeAdapter = localAdapter;

const db = {
  async init() {
    await activeAdapter.init();
  },

  users: {
    create: (data) => activeAdapter.createUser(data),
    getByEmail: (email) => activeAdapter.getUserByEmail(email),
    getById: (id) => activeAdapter.getUserById(id),
  },

  forms: {
    create: (data) => activeAdapter.createForm(data),
    getByUserId: (userId) => activeAdapter.getFormsByUserId(userId),
    getById: (id) => activeAdapter.getFormById(id),
    update: (id, userId, updates) => activeAdapter.updateForm(id, userId, updates),
    delete: (id, userId) => activeAdapter.deleteForm(id, userId),
  },

  submissions: {
    create: (data) => activeAdapter.createSubmission(data),
    getByFormId: (formId, limit) => activeAdapter.getSubmissionsByFormId(formId, limit),
    update: (id, updates) => activeAdapter.updateSubmission(id, updates),
  },
};

module.exports = db;

const nodemailer = require("nodemailer");

function getTransporter() {
    return nodemailer.createTransport({
        host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
        port: Number(process.env.MAILTRAP_PORT || 2525),
        secure: false,
        auth: {
            user: process.env.MAILTRAP_USER || "",
            pass: process.env.MAILTRAP_PASS || "",
        },
    });
}

function ensureMailConfig() {
    if (!process.env.MAILTRAP_USER || !process.env.MAILTRAP_PASS) {
        throw new Error("Mailtrap credentials are not configured");
    }
}

async function sendMailInternal(message) {
    ensureMailConfig();
    return await getTransporter().sendMail({
        from: process.env.MAIL_FROM || 'admin@haha.com',
        ...message
    });
}

module.exports = {
    isMailConfigured: function () {
        return Boolean(process.env.MAILTRAP_USER && process.env.MAILTRAP_PASS);
    },
    sendMail: async function (to, url) {
        await sendMailInternal({
            to: to,
            subject: "reset password email",
            text: "click vao day de doi pass",
            html: "click vao <a href=\"" + url + "\">day</a> de doi pass",
        })
    },
    sendImportedUserPasswordMail: async function (to, username, password) {
        await sendMailInternal({
            to: to,
            subject: "Thong tin tai khoan moi",
            text: "Xin chao " + username + ", mat khau tam thoi cua ban la: " + password,
            html: "<p>Xin chao <b>" + username + "</b>,</p><p>Mat khau tam thoi cua ban la: <b>" + password + "</b></p><p>Hay dang nhap va doi mat khau sau khi nhan tai khoan.</p>",
        });
    }
}

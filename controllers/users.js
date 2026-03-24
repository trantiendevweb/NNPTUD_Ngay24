let crypto = require('crypto')
let ExcelJS = require('exceljs')
let userModel = require("../schemas/users");
let roleModel = require("../schemas/roles");
let cartModel = require("../schemas/carts");
let bcrypt = require('bcrypt')
let jwt = require('jsonwebtoken')
let { isMailConfigured, sendImportedUserPasswordMail } = require('../utils/sendMail')

function cellToString(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (Array.isArray(value.richText)) {
            return value.richText.map(item => item.text).join('').trim();
        }
        if (value.text !== undefined && value.text !== null) {
            return String(value.text).trim();
        }
        if (value.result !== undefined && value.result !== null) {
            return cellToString(value.result);
        }
    }
    return String(value).trim();
}

function generateTemporaryPassword(length = 16) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let password = '';
    while (password.length < length) {
        const buffer = crypto.randomBytes(length);
        for (const byte of buffer) {
            password += charset[byte % charset.length];
            if (password.length === length) {
                break;
            }
        }
    }
    return password;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildHeaderMap(headerRow) {
    let map = {};
    headerRow.eachCell({ includeEmpty: true }, function (cell, colNumber) {
        let header = cellToString(cell.value).toLowerCase();
        if (header) {
            map[header] = colNumber;
        }
    });
    return map;
}

async function ensureImportRole() {
    let role = await roleModel.findOne({
        name: /^user$/i,
        isDeleted: false
    });
    if (role) {
        return role;
    }

    try {
        role = new roleModel({
            name: 'user',
            description: 'default role for imported users'
        });
        await role.save();
        return role;
    } catch (error) {
        return await roleModel.findOne({
            name: /^user$/i,
            isDeleted: false
        });
    }
}

async function rollbackImportedUser(userId) {
    await cartModel.deleteOne({ user: userId });
    await userModel.deleteOne({ _id: userId });
}

module.exports = {
    CreateAnUser: async function (username, password, email, role, session, fullName, avatarUrl, status, loginCount) {
        let newItem = new userModel({
            username: username,
            password: password,
            email: email,
            fullName: fullName,
            avatarUrl: avatarUrl,
            status: status,
            role: role,
            loginCount: loginCount
        });
        await newItem.save({ session });
        return newItem;
    },
    GetAllUser: async function () {
        return await userModel
            .find({ isDeleted: false })
    },
    GetUserById: async function (id) {
        try {
            return await userModel
                .findOne({
                    isDeleted: false,
                    _id: id
                }).populate('role')
        } catch (error) {
            return false;
        }
    },
    GetUserByEmail: async function (email) {
        try {
            return await userModel
                .findOne({
                    isDeleted: false,
                    email: email
                })
        } catch (error) {
            return false;
        }
    },
    GetUserByToken: async function (token) {
        try {
            let user = await userModel
                .findOne({
                    isDeleted: false,
                    forgotPasswordToken: token
                })
            if (user.forgotPasswordTokenExp > Date.now()) {
                return user;
            }
            return false;
        } catch (error) {
            return false;
        }
    },
    QueryLogin: async function (username, password) {
        if (!username || !password) {
            return false;
        }
        let user = await userModel.findOne({
            username: username,
            isDeleted: false
        })
        if (user) {
            if (user.lockTime && user.lockTime > Date.now()) {
                return false;
            } else {
                if (bcrypt.compareSync(password, user.password)) {
                    user.loginCount = 0;
                    await user.save();
                    let token = jwt.sign({
                        id: user.id
                    }, 'secret', {
                        expiresIn: '1d'
                    })
                    return token;
                } else {
                    //sai pass
                    user.loginCount++;
                    if (user.loginCount == 3) {
                        user.loginCount = 0;
                        user.lockTime = Date.now() + 3_600_000;
                    }
                    await user.save();
                    return false;
                }
            }
        } else {
            return false;
        }
    },
    ChangePassword: async function (user, oldPassword, newPassword) {
        if (bcrypt.compareSync(oldPassword, user.password)) {
            user.password = newPassword;
            await user.save();
            return true;
        } else {
            return false;
        }
    },
    ImportUsersFromExcel: async function (filePath) {
        if (!isMailConfigured()) {
            throw new Error("Mailtrap credentials are not configured");
        }

        let workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        let worksheet = workbook.worksheets[0];
        if (!worksheet) {
            throw new Error("Excel file does not contain any worksheet");
        }

        let headerMap = buildHeaderMap(worksheet.getRow(1));
        if (!headerMap.username || !headerMap.email) {
            throw new Error("Excel file must contain username and email columns");
        }

        let role = await ensureImportRole();
        if (!role) {
            throw new Error("Cannot resolve role user for import");
        }

        let results = [];
        let seenUsernames = new Set();
        let seenEmails = new Set();

        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            let row = worksheet.getRow(rowNumber);
            let username = cellToString(row.getCell(headerMap.username).value);
            let email = cellToString(row.getCell(headerMap.email).value).toLowerCase();

            if (!username && !email) {
                continue;
            }

            if (!username || !email) {
                results.push({
                    row: rowNumber,
                    username: username,
                    email: email,
                    status: 'failed',
                    message: 'username and email are required'
                });
                continue;
            }

            let usernameKey = username.toLowerCase();
            if (seenUsernames.has(usernameKey) || seenEmails.has(email)) {
                results.push({
                    row: rowNumber,
                    username: username,
                    email: email,
                    status: 'failed',
                    message: 'duplicate username or email inside Excel file'
                });
                continue;
            }

            if (!isValidEmail(email)) {
                results.push({
                    row: rowNumber,
                    username: username,
                    email: email,
                    status: 'failed',
                    message: 'email is invalid'
                });
                continue;
            }

            let existingUser = await userModel.findOne({
                $or: [
                    { username: username },
                    { email: email }
                ]
            });
            if (existingUser) {
                results.push({
                    row: rowNumber,
                    username: username,
                    email: email,
                    status: 'failed',
                    message: 'username or email already exists'
                });
                continue;
            }

            let temporaryPassword = generateTemporaryPassword();
            let createdUser;

            try {
                createdUser = await this.CreateAnUser(
                    username,
                    temporaryPassword,
                    email,
                    role._id
                );

                let cart = new cartModel({
                    user: createdUser._id
                });
                await cart.save();

                await sendImportedUserPasswordMail(email, username, temporaryPassword);

                seenUsernames.add(usernameKey);
                seenEmails.add(email);
                results.push({
                    row: rowNumber,
                    username: username,
                    email: email,
                    status: 'success',
                    message: 'user imported and email sent'
                });
            } catch (error) {
                if (createdUser) {
                    await rollbackImportedUser(createdUser._id);
                }
                results.push({
                    row: rowNumber,
                    username: username,
                    email: email,
                    status: 'failed',
                    message: error.message
                });
            }
        }

        let importedCount = results.filter(item => item.status === 'success').length;
        let failedCount = results.filter(item => item.status === 'failed').length;

        return {
            file: filePath,
            role: {
                id: role._id,
                name: role.name
            },
            totalRows: Math.max(worksheet.rowCount - 1, 0),
            importedCount: importedCount,
            failedCount: failedCount,
            results: results
        };
    }
}

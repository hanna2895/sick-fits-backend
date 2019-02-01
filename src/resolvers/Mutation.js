const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto'); // built in module for node
const { promisify }  = require('util'); // from node's util library - takes a callback and turns it into a promise
const { transport, makeANiceEmail } = require('../mail');

const Mutations = {
    async createItem(parent, args, ctx, info) {
        // TODO: check if they are logged in

        const item = await ctx.db.mutation.createItem({
            data: {
                ...args
            }
        }, info);

        return item;
    },
    updateItem(parent, args, ctx, info) {
        // first take a copy of the updates 
        const updates = { ... args };
        // remove the id from the updates 
        delete updates.id;
        // run the update method 
        return ctx.db.mutation.updateItem({
            data: updates,
            where: {
                id: args.id
            }
        }, info );
    },
    async deleteItem(parent, args, ctx, info) {
        const where = { id: args.id };
        // find the item 
        const item = await ctx.db.query.item({ where }, `{ id title }`)
        // check if they own that item or have the permissions
        // TODO 
        // delete it
        return ctx.db.mutation.deleteItem({ where }, info);
    },
    async signup(parent, args, ctx, info) {
        // lowercase their email
        args.email = args.email.toLowerCase();
        // hash their password 
        const password = await bcrypt.hash(args.password, 10);
        // create the user in the database
        const user = await ctx.db.mutation.createUser({
            data: {
                ...args,
                password,
                permissions: { set: ['USER'] },
            }
        }, info);
        // create the JWT token for them
        const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
        // we set the JWT as a cookie on the response 
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie 
        });
        // return user to the browser
        return user;
    },
    async signin(parent, {email, password}, ctx, info) {
        // 1. check if there is a user with that email
        const user = await ctx.db.query.user({ where: { email }});
        if(!user) {
            throw new Error(`No such user found for email ${email}`);
        }
        // 2. check if their password is correct
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            throw new Error('Invalid Password');
        }
        // 3. generate JWT token
        const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
        });
        // 4. set the cookie with the token 
        return user;
        // 5. return the user
    },
    signout(parent, args, ctx, info) {
        ctx.response.clearCookie('token'); // from cookieParser middleware
        return { message: 'Goodbye!'}
    },
    async requestReset(parent, args, ctx, info) {
        // 1. Check if this is a real user
        const user = await ctx.db.query.user({ where: { email: args.email } });
        if (!user) {
            throw new Error(`No such user found for email ${args.email}`);
        }
        // 2. set a reset token and expiry on that user
        const randomBytesPromiseified = promisify(randomBytes);
        const resetToken = (await randomBytesPromiseified(20)).toString('hex'); // takes length, returns a buffer, and you turn that into a hex
        const resetTokenExpiry = Date.now() + 3600000; // one hour from now
        const res = await ctx.db.mutation.updateUser({
            where: { email: args.email },
            data: { resetToken, resetTokenExpiry },
        });
        // 3. email them that reset token
        const mailRes = await transport.sendMail({
            from: 'hanna.w28@gmail.com',
            to: user.email,
            subject: 'Your Password Reset Token',
            html: makeANiceEmail(`Your Password Reset Token is here! \n\n <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click Here to Reset</a>`)
        });
        // 4. return the message
        return { message: 'Thanks!' }

    },
    async resetPassword(parent, args, ctx, info) {
        // 1. check if the passwords match
        if (args.password !== args.confirmPassword) {
            throw new Error('Your passwords do not match');
        }
        // 2. check if it's a legit reset token 
        // 3. check if it's expired
        const [user] = await ctx.db.query.users({
            where: {
                resetToken: args.resetToken,
                resetTokenExpiry_gte: Date.now() - 3600000,
              },
        }); // grab the first user when we search for users. find someone with that token, check that the token is not expired.
        if (!user) {
            throw new Error('This token is either invalid or expired');
        }
        // 4. hash their new password
        const password = await bcrypt.hash(args.password, 10);
        // 5. save the new password to the user and remove old reset token
        const updatedUser = await ctx.db.mutation.updateUser({
            where: {
                email: user.email
            },
            data: {
                password,
                resetToken: null,
                resetTokenExpiry: null,
            }
        })
        // 6. generate jwt
        const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
        // 7. set the jwt cookie
        ctx.response.cookie('token', token, {
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24 * 365
        });
        // 8. return the new user
        return updatedUser;
        // 9. have a beer. 
    }
};

module.exports = Mutations;

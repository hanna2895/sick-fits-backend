const cookieParser = require('cookie-parser');
require('dotenv').config({ path: 'variables.env'});
const jwt = require('jsonwebtoken');
const createServer = require('./createServer');
const db = require('./db');


const server = createServer();

// use express middleware to handle cookies (JWT)
server.express.use(cookieParser());

// decode the JWT so we can get the user id on each request
server.express.use((req, res, next) => {
    // pull the token out of the request
    const { token } = req.cookies;

    // decode the token
    if(token) {
        const { userID } = jwt.verify(token, process.env.APP_SECRET);
        //put the user id on the req for further requests to access
        req.userID = userID;
    }
    next();
});

server.start({
    cors: {
        credentials: true,
        origin: process.env.FRONTEND_URL,
    },
    
}, deets => {
    console.log(`Server is now running on port http://localhost:${deets.port}`);
    }
);
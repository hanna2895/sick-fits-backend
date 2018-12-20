const { forwardTo } = require('prisma-binding');

const Query = {
    items: forwardTo('db'),
    // this is replaced by the above: 
    // async items(parent, args, ctx, info) {
    //     const items = await ctx.db.query.items();
    //     return items;
    // }

};

module.exports = Query;

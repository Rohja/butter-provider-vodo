'use strict';

var Provider = require('butter-provider');
var querystring = require('querystring');
var Q = require('q');
var axios = require('axios');
var inherits = require('util').inherits;
var _ = require('lodash');
var Datastore = require('nedb');

var db = new Datastore();

var Web3 = require('web3');
var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"))

function Vodo(args) {
    if (!(this instanceof Vodo)) {
        return new Vodo(args);
    }

    Provider.call(this, args);
    this.apiUrl = this.args.urlList
}
inherits(Vodo, Provider);

Vodo.prototype.config = {
    name: 'vodo',
    uniqueId: 'imdb_id',
    tabName: 'Vodo',
    contract: {
	address: '0x14fc4bb64bd8006ebcdb98cef3103b3db9e15acf',
	abi: [{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"keys","outputs":[{"name":"","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"key","type":"string"}],"name":"getRecord","outputs":[{"name":"owner","type":"address"},{"name":"time","type":"uint256"},{"name":"title","type":"string"},{"name":"year","type":"uint16"},{"name":"imdb_id","type":"string"},{"name":"rotten_id","type":"string"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"key","type":"string"},{"name":"title","type":"string"},{"name":"year","type":"uint16"},{"name":"imdb_id","type":"string"},{"name":"rotten_id","type":"string"}],"name":"update","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"kill","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"key","type":"string"}],"name":"getOwner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"key","type":"string"}],"name":"unregister","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"rindex","type":"uint256"}],"name":"getRecordAtIndex","outputs":[{"name":"key","type":"string"},{"name":"owner","type":"address"},{"name":"time","type":"uint256"},{"name":"title","type":"string"},{"name":"year","type":"uint16"},{"name":"imdb_id","type":"string"},{"name":"rotten_id","type":"string"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"key","type":"string"},{"name":"title","type":"string"},{"name":"year","type":"uint16"},{"name":"imdb_id","type":"string"},{"name":"rotten_id","type":"string"}],"name":"register","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"key","type":"string"}],"name":"getTime","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"numRecords","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"key","type":"string"}],"name":"isRegistered","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"creationTime","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"to","type":"address"},{"name":"value","type":"uint256"}],"name":"withdraw","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"key","type":"string"},{"name":"newOwner","type":"address"}],"name":"transfer","outputs":[],"payable":false,"type":"function"}],
    },
    filters: {
        sorters: {
            // popularity: 'Popularity',
            updated: 'Updated',
            year: 'Year',
            alphabet: 'Alphabetical',
            // rating: 'Rating'
        }
    },
    defaults: {
        urlList: ['http://butter.vodo.net/popcorn']
    },
    args: {
        urlList: Provider.ArgType.ARRAY
    },
    /* should be removed */
    //subtitle: 'ysubs',
    metadata: 'trakttv:movie-metadata'
};

function formatForButter(items) {
    var results = {};
    var movieFetch = {};
    movieFetch.results = [];
    movieFetch.hasMore = (Number(items.length) > 1 ? true : false);
    items.forEach(function (movie) {
        if (movie.Quality === '3D') {
            return;
        }
        var imdb = movie.ImdbCode;

        // Calc torrent health
        var seeds = 0; //XXX movie.TorrentSeeds;
        var peers = 0; //XXX movie.TorrentPeers;

        var torrents = {};
        torrents[movie.Quality] = {
            url: movie.TorrentUrl,
            size: movie.SizeByte,
            filesize: movie.Size,
            seed: seeds,
            peer: peers
        };

        var ptItem = results[imdb];
        if (!ptItem) {
            ptItem = {
                imdb_id: imdb,
                title: movie.MovieTitleClean.replace(/\([^)]*\)|1080p|DIRECTORS CUT|EXTENDED|UNRATED|3D|[()]/g, ''),
                year: movie.MovieYear,
                genres: movie.Genre.split(','),
                rating: movie.MovieRating,
                poster: movie.CoverImage,
                backdrop: movie.CoverImage,
                runtime: movie.Runtime,
                torrents: torrents,
                subtitle: {}, // TODO
                trailer: false,
                synopsis: movie.Synopsis || 'No synopsis available.',
                type: Provider.ItemType.MOVIE
            };

            movieFetch.results.push(ptItem);
        } else {
            _.extend(ptItem.torrents, torrents);
        }

        results[imdb] = ptItem;
    })

    return movieFetch.results;
}

Vodo.prototype.updateAPI = function () {
    var self = this;
    var defer = Q.defer();

    var lulzTorrentContract = web3.eth.contract(this.contract.abi);
    var lulzTorrent = lulzTorrentContract.at(this.contract.address);

    console.info('Request to Vodo', this.apiUrl);
    axios(this.apiUrl[0], {
        strictSSL: false,
        json: true,
        timeout: 10000
    })
    .then(function(res) {
        let data = res.data
        /*
           data = _.map (helpers.formatForButter(data), function (item) {
           item.rating = item.rating.percentage * Math.log(item.rating.votes);
           return item;
           });
         */
        db.insert(formatForButter(data.downloads), function (err, newDocs) {
            if (err) {
                console.error('Vodo.updateAPI(): Error inserting', err);
            }

            db.find({}).limit(2).exec(function (err, docs) {
                //console.debug('FIND ---->', err, docs);
            });
            defer.resolve(newDocs);
        });
    })

    return defer.promise;
};

Vodo.prototype.fetch = function (filters) {
    var self = this;
    if (!self.fetchPromise) {
        self.fetchPromise = this.updateAPI();
    }

    var defer = Q.defer();
    var params = {
        sort: 'rating',
        limit: 50
    };
    var findOpts = {};

    if (filters.keywords) {
        findOpts = {
            title: new RegExp(filters.keywords.replace(/\s/g, '\\s+'), 'gi')
        };
    }

    if (filters.genre) {
        params.genre = filters.genre;
    }

    if (filters.order) {
        params.order = filters.order;
    }

    if (filters.sorter && filters.sorter !== 'popularity') {
        params.sort = filters.sorter;
    }

    var sortOpts = {};
    sortOpts[params.sort] = params.order;

    self.fetchPromise.then(function () {
        db.find(findOpts)
            .sort(sortOpts)
            .skip((filters.page - 1) * params.limit)
            .limit(Number(params.limit))
            .exec(function (err, docs) {
                docs.forEach(function (entry) {
                    entry.type = 'movie';
                });

                return defer.resolve({
                    results: docs,
                    hasMore: docs.length ? true : false
                });
            });
    });

    return defer.promise;
};

Vodo.prototype.detail = function (torrent_id, old_data) {
    return Q(old_data);
};


module.exports = Vodo

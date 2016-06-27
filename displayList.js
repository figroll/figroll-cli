"use strict";

let color = require('bash-color');

function displayList(sites) {

    console.log("")

    let proSites = [];
    let freeSites = [];

    sites.sort(function(a, b) {
        return new Date(a.createdAt) - new Date(b.createdAt);
    }).forEach(function(site, idx) {
        if (site.plan === "paid") {
            proSites.push(site.fqdn)
        } else {
            freeSites.push(site.fqdn);
        }
    });

    if (proSites.length > 0) {
        console.log("Pro:")
        proSites.forEach(function(site, idx) {
            console.log("    " + color.blue(proSites[idx]));
        });
        console.log("")
    }

    if (freeSites.length > 0) {
        console.log("Free:")
        freeSites.forEach(function(site, idx) {
            console.log("    " + color.green(freeSites[idx]));
        });
    }

    console.log("")
    console.log("Create a new site:");
    console.log('    (use "figroll create")');

    console.log("")
    console.log("Connect to a site:");
    console.log('    (use "figroll connect <sitedomain> path/to/dist-path" to connect to your site)');

    if (sites.length > 0) {
        console.log('    (E.g. figroll connect ' + (sites[0].plan === "paid" ? color.blue(sites[0].fqdn) : color.green(sites[0].fqdn)) + " dist/)" );
    }
}


module.exports = displayList;

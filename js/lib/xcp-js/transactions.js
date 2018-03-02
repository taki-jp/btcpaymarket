


function xcp_rc4(key, datachunk) {
    
    return bin2hex(rc4(hex2bin(key), hex2bin(datachunk)));
    
}

//----
//multisig encoding START

function address_from_pubkeyhash(pubkeyhash) {
    
    var publicKey = new bitcore.PublicKey(pubkeyhash);
    var address = bitcore.Address.fromPublicKey(publicKey);
    
    //console.log(address.toString());
    return address.toString();
    
}

function addresses_from_datachunk(datachunk) {
    
    var hex_byte_array = hex_byte();
    
    var pubkey_seg1 = datachunk.substring(0, 62);
    var pubkey_seg2 = datachunk.substring(62, 124);
    var first_byte = "02";
    var second_byte;
    var pubkeyhash;
    var address1="";
    var address2="";
    var rand;
    
    while (address1.length == 0) {
        rand = randomIntFromInterval(0,255);
        
        second_byte = hex_byte_array[rand];          
        pubkeyhash = first_byte + pubkey_seg1 + second_byte;
            
        if (bitcore.PublicKey.isValid(pubkeyhash)){
            console.log(pubkeyhash);        
            var hash1 = pubkeyhash;
            var address1 = address_from_pubkeyhash(pubkeyhash);
        }    

    }
    
    while (address2.length == 0) {
        rand = randomIntFromInterval(0,255);
        
        second_byte = hex_byte_array[rand];          
        pubkeyhash = first_byte + pubkey_seg2 + second_byte;
            
        if (bitcore.PublicKey.isValid(pubkeyhash)){
            console.log(pubkeyhash);
            var hash2 = pubkeyhash;
            var address2 = address_from_pubkeyhash(pubkeyhash);
        }  

    }
         
    console.log(address1);
    console.log(address2);
    
    var data_hashes = [hash1, hash2];
    
    return data_hashes;
    
}

//multisig encoding END
//----


function isdatacorrect(data_chunk, asset, asset_total) {
            
    var asset_id = padprefix(assetid(asset),16)
    console.log(asset_id)

    var assethex = data_chunk.substring(42, 26)
    console.log(assethex)

    var amount = data_chunk.substring(58, 42)
    var amount_dec = parseInt(amount, 16) / 100000000

    if (asset_id == assethex && asset_total == amount_dec) {
        var correct = "yes"
    } else {
        var correct = "no"
    }

    return correct

}


function checkDivisibility(asset, callback) {
    
    if (asset == "BTC") {
        
        callback("true");
        
    } else {
    
        var xcp_source_html = "https://counterpartychain.io/api/asset/"+asset;

        var result;
    
        $.getJSON( xcp_source_html, function( data ) {  

            if (data.success == 1) {

                var divisibility = data.divisible;

                if(divisibility == 1) {
                    result = "true"; 
                } else {
                    result = "false";
                }

            } else {

                result = "error";

            }

            callback(result);

        })
    
    }
    
    
}

function assetid(asset_name) {
    
    //asset_name.toUpperCase();

    if (asset_name == XCP) {
        
        var asset_id = (1).toString(16);
        
    } else if (asset_name == BTC) { 
        
        var asset_id = (0).toString(16);
    
    } else if (asset_name.substr(0, 1) == "A") {
        
        var pre_id = asset_name.substr(1);
        
        var pre_id_bigint = BigIntegerSM(pre_id);
        
        var asset_id = pre_id_bigint.toString(16);
          
    } else {  
    
        var b26_digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; 
        var name_array = asset_name.split("");

        var n_bigint = BigIntegerSM(0);
    
        for (i = 0; i < name_array.length; i++) { 
            
            n_bigint = BigIntegerSM(n_bigint).multiply(26);
            n_bigint = BigIntegerSM(n_bigint).add(b26_digits.indexOf(name_array[i]));
                    
        }    

        var asset_id = n_bigint.toString(16);
    
    } 
    
    //return asset_id;
    console.log(asset_id);
    
    return asset_id;
    
}


//Asset Send Tx type

function create_xcp_send_data_opreturn(asset_name, amount, callback) {
    
    var prefix = "434e54525052545900000000"; //CNTRPRTY
    var asset_id = assetid(asset_name); 
    
    console.log("from cxsdo: "+asset_id);
    
    var asset_id_hex = padprefix(asset_id.toString(16), 16);
    
    var amount_round = parseInt((amount*100000000).toFixed(0));
    
    var amount_hex = padprefix((amount_round).toString(16), 16);
                               
    var data = prefix + asset_id_hex + amount_hex; 
    
    //return data;
    
    callback(data)
    
}


function sendXCP_opreturn(add_from, add_to, asset, asset_total, btc_total, transfee, mnemonic, callback) {

    var amountremaining = ((parseFloat(btc_total) * 100000000) + (parseFloat(transfee)*100000000))/100000000;
        
    getutxos(add_from, mnemonic, amountremaining, function(total_utxo, satoshi_change){ 

        create_xcp_send_data_opreturn(asset, asset_total, function(datachunk_unencoded){
        
            var check_data = "1c"+datachunk_unencoded;
            var correct = isdatacorrect(check_data, asset, asset_total); 
            console.log(correct);
            console.log(datachunk_unencoded);

            var datachunk_encoded = xcp_rc4(total_utxo[0].txid, datachunk_unencoded);
            var scriptstring = "OP_RETURN 28 0x"+datachunk_encoded;
            var data_script = new bitcore.Script(scriptstring);

            var transaction = new bitcore.Transaction();

            //inputs
            for (i = 0; i < total_utxo.length; i++) {
                transaction.from(total_utxo[i]);     
            }
            console.log(total_utxo);

            //outputs            
            var btc_total_satoshis = parseFloat((btc_total * 100000000).toFixed(0));
            console.log(btc_total_satoshis);

            transaction.to(add_to, btc_total_satoshis);
            var xcpdata_opreturn = new bitcore.Transaction.Output({script: data_script, satoshis: 0}); 
            transaction.addOutput(xcpdata_opreturn);

            console.log(satoshi_change);
            if (satoshi_change > 54600) {
                transaction.change(add_from);
            }

            //sign tx
            var privkey = getprivkey(add_from, mnemonic); 
            transaction.sign(privkey);
            var final_trans = transaction.uncheckedSerialize()

            if (correct == "yes") {   
                callback(final_trans)  //push raw tx to the coin network
            } else {
                callback("error")
            }      

        })

    })
    
}







//Broadcast Tx type

function create_broadcast_data(message, value, feefraction, type) {
    
    //max 32 character broadcast for single OP_CHECKMULTISIG output
    //fee fraction must be less than 42.94967295 to be stored as a 4-byte hexadecimal
    
    var feefraction_int = parseFloat(feefraction).toFixed(8) * 100000000;
    feefraction_int = Math.round(feefraction_int);
    
    if (message.length <= 46 && feefraction_int <= 4294967295) {
        
        var currenttime = Math.floor(Date.now() / 1000);
        var currenttime_hex = currenttime.toString(16);   
            
        var cntrprty_prefix = "434e5452505254590000001e"; //includes ID = 30
          
        var messagelength = message.length;
        var messagelength_hex = padprefix(messagelength.toString(16),2);
        
        var initiallength = parseFloat(messagelength) + 29;
        var initiallength_hex = padprefix(initiallength.toString(16),2);
         
        var feefraction_hex = padprefix(feefraction_int.toString(16),8);
       
        var message_hex_short = bin2hex(message);
        
        var value_binary = toIEEE754Double(parseFloat(value));
    
        var value_hex_array = new Array();
        
        for (i = 0; i < value_binary.length; ++i) {
            value_hex_array[i] = padprefix(value_binary[i].toString(16),2);
        }

        var value_hex = value_hex_array.join("");
        
        if (type == "OP_CHECKMULTISIG" && message.length <= 32) {
        
            var message_hex = padtrail(message_hex_short, 64);

            var broadcast_tx_data = initiallength_hex + cntrprty_prefix + currenttime_hex + value_hex + feefraction_hex + messagelength_hex + message_hex;
            
        } else if (type == "OP_RETURN") {
            
            var broadcast_tx_data = cntrprty_prefix + currenttime_hex + value_hex + feefraction_hex + messagelength_hex + message_hex_short;
            
        }
          
        return broadcast_tx_data;
    
    } else {
        
        var error = "error";
        return error;
        
    }
    
}

function sendBroadcast(add_from, message, value, feefraction, msig_total, transfee, mnemonic, callback) {
       
    //var mnemonic = $("#newpassphrase").html();
    
    var privkey = getprivkey(add_from, mnemonic);
     
    var source_html = INSIGHT_API_SERVER+"/addr/"+add_from+"/utxo";  
    var total_utxo = new Array();   
       
    $.getJSON( source_html, function( data ) {
        
        var amountremaining = parseFloat(msig_total) + parseFloat(transfee);
        
        data.sort(function(a, b) {
            return b.amount - a.amount;
        });
        
        $.each(data, function(i, item) {
            
             var txid = data[i].txid;
             var vout = data[i].vout;
             var script = data[i].scriptPubKey;
             var amount = parseFloat(data[i].amount);
             
             amountremaining = amountremaining - amount;            
             amountremaining.toFixed(8);
    
             var obj = {
                "txid": txid,
                "address": add_from,
                "vout": vout,
                "scriptPubKey": script,
                "amount": amount
             };
            
             total_utxo.push(obj);
              
             //dust limit = 5460 
            
             if (amountremaining == 0 || amountremaining < -0.00005460) {                                 
                 return false;
             }
             
        });
    
        var utxo_key = total_utxo[0].txid;
        
        if (amountremaining < 0) {
            var satoshi_change = -(amountremaining.toFixed(8) * 100000000).toFixed(0);
        } else {
            var satoshi_change = 0;
        }
    
        var datachunk_unencoded = create_broadcast_data(message, value, feefraction);
        
        console.log(datachunk_unencoded);
        
        if (datachunk_unencoded != "error") {
        
            var datachunk_encoded = xcp_rc4(utxo_key, datachunk_unencoded);
            var address_array = addresses_from_datachunk(datachunk_encoded);
        
            var sender_pubkeyhash = new bitcore.PublicKey(bitcore.PrivateKey.fromWIF(privkey));
        
            var scriptstring = "OP_1 33 0x"+address_array[0]+" 33 0x"+address_array[1]+" 33 0x"+sender_pubkeyhash+" OP_3 OP_CHECKMULTISIG";
            console.log(scriptstring);
            var data_script = new bitcore.Script(scriptstring);
        
            var transaction = new bitcore.Transaction();
            
            for (i = 0; i < total_utxo.length; i++) {
                transaction.from(total_utxo[i]);
            }
        
            var msig_total_satoshis = parseFloat((msig_total * 100000000).toFixed(0));
        
            var xcpdata_msig = new bitcore.Transaction.Output({script: data_script, satoshis: msig_total_satoshis}); 
        
            transaction.addOutput(xcpdata_msig);
                  
            if (satoshi_change > 5459) {
                transaction.to(add_from, satoshi_change);
            }
        
            transaction.sign(privkey);

            var final_trans = transaction.serialize();
            
            console.log(final_trans);
        
            sendBTCpush(final_trans);  //uncomment to push raw tx to the bitcoin network
            
            callback();
            
        } else {
            
            $("#broadcastmessage").val("Error! Refresh to Continue...");
            
        }
        


    });
    
}

function sendBroadcast_opreturn(add_from, message, value, feefraction, transfee, mnemonic, callback) {
       
    var privkey = getprivkey(add_from, mnemonic);
     
    var source_html = INSIGHT_API_SERVER+"/addr/"+add_from+"/utxo";     
    
    var total_utxo = new Array();   
       
    $.getJSON( source_html, function( data ) {
        
        var amountremaining = (parseFloat(transfee)*100000000)/100000000;
        
        console.log(amountremaining);
        
        data.sort(function(a, b) {
            return b.amount - a.amount;
        });
        
        $.each(data, function(i, item) {
            
             var txid = data[i].txid;
             var vout = data[i].vout;
             var script = data[i].scriptPubKey;

            
//             var txid = data[i].tx;
//             var vout = data[i].n;
//             var script = data[i].script;
             var amount = parseFloat(data[i].amount);
             
             amountremaining = amountremaining - amount;            
             amountremaining.toFixed(8);
    
             var obj = {
                "txid": txid,
                "address": add_from,
                "vout": vout,
                "scriptPubKey": script,
                "amount": amount
             };
            
             total_utxo.push(obj);
              
             //dust limit = 5460 
            
             if (amountremaining == 0 || amountremaining < -0.00005460) {                                 
                 return false;
             }
             
        });
    
        var utxo_key = total_utxo[0].txid;
        
        if (amountremaining < 0) {
            var satoshi_change = -(amountremaining.toFixed(8) * 100000000).toFixed(0);
        } else {
            var satoshi_change = 0;
        }
    
        var datachunk_unencoded = create_broadcast_data(message, value, feefraction, "OP_RETURN");

        console.log(datachunk_unencoded);
        
        if (datachunk_unencoded != "error") {
            
            var datachunk_encoded = xcp_rc4(utxo_key, datachunk_unencoded);

            var bytelength = datachunk_encoded.length / 2;

            var scriptstring = "OP_RETURN OP_PUSHDATA1 "+bytelength+" 0x"+datachunk_encoded;
            var data_script = new bitcore.Script(scriptstring);

            var transaction = new bitcore.Transaction();

            for (i = 0; i < total_utxo.length; i++) {
                transaction.from(total_utxo[i]);     
            }

            console.log(total_utxo);

            var xcpdata_opreturn = new bitcore.Transaction.Output({script: data_script, satoshis: 0}); 

            transaction.addOutput(xcpdata_opreturn);

            console.log(satoshi_change);

            if (satoshi_change > 5459) {
                transaction.change(add_from);
            }

            transaction.sign(privkey);

            var final_trans = transaction.uncheckedSerialize();
            
            console.log(final_trans);
        
            //sendBTCpush(final_trans);  //uncomment to push raw tx to the bitcoin network
            
            callback();
            
        } else {
            
            $("#broadcastmessage").val("Error! Refresh to Continue...");
            
        }
        


    });
    
}



  var xumm = new Xumm('223d472d-89f5-4e1a-89a4-b71a0769fac2');
    var transactions = [];
    var currentPage = 0;
    var pageSize = 5;

    xumm.on("ready", () => console.log("Ready (e.g. hide loading state of page)"));

xumm.on("success", async () => {
    xumm.user.account.then(async (account) => {
        document.getElementById('accountaddress').innerText = account;
        
        // Hide login button and show logout button
        document.getElementById('signinbutton').style.display = "none";
        document.getElementById('logoutbutton').style.display = "block";

        // Fetch balance
        fetchBalance(account);

        // Fetch transactions & update KPIs
        fetchTransactions(account);
    });
});

xumm.on("logout", async () => {
    document.getElementById('accountaddress').innerText = '...';
    document.getElementById('total-balance').innerText = '0';
    document.getElementById('balance-usd').innerText = '$0';
    document.getElementById('rlusd-balance').innerText = '$0';

    document.getElementById('total-transactions').innerText = '0';
    document.getElementById('total-received').innerText = '0 XRP';
    document.getElementById('transaction-table-body').innerHTML = '<tr><td colspan="4">No transactions found</td></tr>';

    // Show login button and hide logout button
    document.getElementById('signinbutton').style.display = "block";
    document.getElementById('logoutbutton').style.display = "none";
});



    async function fetchBalance(account) {
        try {
            const client = new xrpl.Client("wss://xrplcluster.com"); // Connect to XRP Ledger
            await client.connect();

            const response = await client.request({
                command: "account_info",
                account: account,
                ledger_index: "validated"
            });

            let balanceXRP = response.result.account_data.Balance / 1000000; // Convert drops to XRP
            document.getElementById('total-balance').innerText = balanceXRP;

            // Fetch XRP to USD conversion rate and update USD balance
            updateBalanceInUSD(balanceXRP);

            // Fetch RLUSD Balance
            const trustLines = await client.request({
                command: "account_lines",
                account: account
            });

            let rlusdBalance = "0"; // Default RLUSD balance
            trustLines.result.lines.forEach(line => {
                if (line.currency === "524C555344000000000000000000000000000000") { // RLUSD currency code
                    rlusdBalance = parseFloat(line.balance).toFixed(2); // Format to 2 decimal places
                }
            });

            document.getElementById('rlusd-balance').innerText = `${rlusdBalance} RLUSD`;



            await client.disconnect();
        } catch (error) {
            console.error("Error fetching balance:", error);
            document.getElementById('total-balance').innerText = "Error";
        }
    }

    async function updateBalanceInUSD(balanceXRP) {
        try {
            const balanceElement = document.getElementById('balance-usd');
            if (!balanceElement) {
                console.error("Error: Element 'balance-usd' not found.");
                return;
            }

            const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd");
            const data = await response.json();
            const xrpToUsdRate = data.ripple.usd;

            balanceElement.innerText = `$${(balanceXRP * xrpToUsdRate).toFixed(2)}`;
        } catch (error) {
            console.error("Error fetching XRP price:", error);
            document.getElementById('balance-usd').innerText = "Error";
        }
    }


    async function fetchTransactions(account) {
        try {
            const client = new xrpl.Client("wss://xrplcluster.com"); // Connect to XRPL
            await client.connect();

            const response = await client.request({
                command: "account_tx",
                account: account,
                ledger_index_min: -1,
                ledger_index_max: -1,
                limit: 20, // Fetch last 20 transactions
                forward: false
            });

            transactions = response.result.transactions.map(tx => ({
                date: new Date((tx.tx.date + 946684800) * 1000).toLocaleString(),
                amount: tx.tx.Amount ? (tx.tx.Amount / 1000000).toFixed(6) : "N/A", // Convert drops to XRP
                hash: tx.tx.hash,
                type: tx.tx.TransactionType,
                sender: tx.tx.Account,
                recipient: tx.tx.Destination
            }));

            updateTable();
            updateKPIs(account); // Update KPI values

            await client.disconnect();
        } catch (error) {
            console.error("Error fetching transactions:", error);
            document.getElementById('transaction-table-body').innerHTML = '<tr><td colspan="4">Error fetching transactions</td></tr>';
        }
    }

async function updateXRPPrice() {
    try {
        const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd");
        const data = await response.json();
        const xrpToUsdRate = data.ripple.usd;

        // Update the XRP price in the HTML
        document.getElementById("xrpPrice").innerText = `$${xrpToUsdRate.toFixed(4)}`;

    } catch (error) {
        console.error("Error fetching XRP price:", error);
        document.getElementById("xrpPrice").innerText = "Error";
    }
}


// Call function on page load
updateXRPPrice();

// Refresh price every 30 seconds
setInterval(updateXRPPrice, 30000);


    function updateKPIs(account) {
        let totalReceived = 0;
        let totalSent = 0;
        let totalTransactions = transactions.length;

        transactions.forEach(tx => {
            if (tx.recipient === account) {
                totalReceived += parseFloat(tx.amount);
            } else if (tx.sender === account) {
                totalSent += parseFloat(tx.amount);
            }
        });

        document.getElementById('total-transactions').innerText = totalTransactions;
        document.getElementById('total-received').innerText = `${totalReceived.toFixed(6)} XRP`;

    }

    function updateTable() {
        const tableBody = document.getElementById("transaction-table-body");
        tableBody.innerHTML = "";

        let start = currentPage * pageSize;
        let end = start + pageSize;
        let paginatedTransactions = transactions.slice(start, end);

        if (paginatedTransactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">No transactions found</td></tr>';
            return;
        }

        paginatedTransactions.forEach(tx => {
            let row = `<tr>
                <td>${tx.date}</td>
                <td>${tx.amount}</td>
                <td class="hash-t">${tx.hash}</td>
                <td>${tx.type}</td>
            </tr>`;
            tableBody.innerHTML += row;
        });

        document.getElementById("prevPage").disabled = currentPage === 0;
        document.getElementById("nextPage").disabled = end >= transactions.length;
    }

    function changePage(direction) {
        currentPage += direction;
        updateTable();
    }

 let chart; // Store chart instance

        async function loadChart(days) {
            try {
                const url = `https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=usd&days=${days}`;
                const response = await fetch(url);
                const data = await response.json();

                const prices = data.prices.map(point => ({ x: new Date(point[0]), y: point[1] }));

                const ctx = document.getElementById("xrpChart").getContext("2d");

                // Destroy old chart if it exists
                if (chart) chart.destroy();

                chart = new Chart(ctx, {
                    type: "line",
                    data: {
                        datasets: [{
                            label: "XRP Price (USD)",
                            data: prices,
                            borderColor: "#2563eb",
                            backgroundColor: "#0d1c27",
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            x: { 
                                type: "time", 
                                time: { unit: "day" }, 
                                ticks: { color: "white" }
                            },
                            y: { ticks: { color: "white" } }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            } catch (error) {
                console.error("Error loading XRP data:", error);
            }
        }

        // Load default chart (1-hour timeframe)
        loadChart("1");


    function updateTotalWalletValue() {
        // Get the text content of the elements
        const balanceUsdText = document.getElementById('balance-usd').innerText;
        const rlusdBalanceText = document.getElementById('rlusd-balance').innerText;

        // Remove non-numeric characters and convert to numbers
        const balanceUsd = parseFloat(balanceUsdText.replace('$', '').trim());
        const rlusdBalance = parseFloat(rlusdBalanceText.replace('RLUSD', '').trim());

        // Ensure both values are valid numbers
        const totalWalletValue = (isNaN(balanceUsd) ? 0 : balanceUsd) + (isNaN(rlusdBalance) ? 0 : rlusdBalance);

        // Update the wallet balance display
        document.getElementById('wallet-balance').innerText = `$${totalWalletValue.toFixed(2)}`;
    }

    // Call the function to update the total

// Delay execution by 5 seconds

setTimeout(() => {
    if (document.getElementById('wallet-balance')) {
        updateTotalWalletValue();
    } else {
        console.error("Element 'wallet-balance' not found after 5 seconds.");
    }
}, 5000);

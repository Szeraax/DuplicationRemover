/**
 * In Manifest V3, menu entries are not unregistered, when the background is
 * terminated, even though the entries are no longer shown. A restarting background
 * or a restarting extension will therefore cause an error when it tries to re-add
 * the already existing entries. The addEntry() helper function of the used menus
 * module is mitigating this.
 *
 * Alternatively, add menu entries only in the onInstalled event, as done for the
 * entries overriding the context menu of action popups below.
 */

browser.runtime.onInstalled.addListener(() => {
    browser.menus.create({
        id: "checkDuplicates",
        title: "Check for duplicates",
        contexts: ["folder_pane"]
    });
});
browser.runtime.onInstalled.addListener(() => {
    browser.menus.create({
        id: "deleteDuplicates",
        title: "Delete duplicates",
        contexts: ["folder_pane"]
    });
});


browser.menus.onClicked.addListener(async (info, tab) => {
    let deleteDups = false;
    if (info.menuItemId == "deleteDuplicates") {
        deleteDups = true;
    }

    for (const folder of info.selectedFolders) {
        // console.log(folder);
        console.log("Iterating through", folder.id)
        processDuplicateMessageIDs(folder.id, deleteDups);
    }
});



async function processDuplicateMessageIDs(folderId, deleteDups) {
    const firstMessageMap = {};   // headerMessageId -> first msg.id
    const duplicateMsgIds = [];   // msg.id of duplicates
    let totalCount = 0;
    let skipped = 0;

    let listResult = await browser.messages.list(folderId);
    let messages = listResult.messages;

    while (messages.length > 0) {
        totalCount += messages.length;
        for (const msg of messages) {
            const headerId = msg.headerMessageId;

            if (!headerId) {
                // Really should never happen since TB uses an MD5 of any message that has no headerMessageId as its headerMessageId.
                console.log(`Warning: Skipping message with no headerId. Date: '${msg.date}', Subject: '${msg.subject}'`)
                skipped++;
                continue; // skip messages without Message-ID
            }

            if (firstMessageMap[headerId] && firstMessageMap[headerId] == msg.size) {
                // Already seen: this is a duplicate
                duplicateMsgIds.push(msg.id);
            } else if (firstMessageMap[headerId]) {
                // Duplicate, but not the same size
                console.log(`Warning: Skipping message with different message size than duplicate. HeaderID: '${headerId}', Subject: '${msg.subject}'`)
                skipped++;
                continue; // skip messages without Message-ID
            } else {
                // First occurrence
                firstMessageMap[headerId] = msg.size;
            }
        }

        // Continue listing more messages if available
        if (listResult.id) {
            listResult = await browser.messages.continueList(listResult.id);
            messages = listResult.messages;
        } else {
            messages = [];
        }
    }

    // console.log("First message map:", firstMessageMap);
    // console.log("Duplicate msg IDs:", duplicateMsgIds);

    let text;
    if (duplicateMsgIds.length > 0) {
        if (deleteDups) {
            await browser.messages.delete(duplicateMsgIds);
            text = `Deleted ${duplicateMsgIds.length} duplicate emails from ${totalCount} total emails`;
        }
        else {
            text = `Found ${duplicateMsgIds.length} duplicate emails among ${totalCount} total emails`;
        }
    } else {
        text = `No duplicates found after iterating ${totalCount} emails`
    }

    // Warn about skipped emails
    if (skipped > 0) {
        text += ` (and ${skipped} skipped emails, see console log for details).`
    }
    else {
        text += "."
    }

    browser.notifications.create({
        type: "basic",
        title: "Deduplication Report",
        message: text
    });
    console.log(text);
}

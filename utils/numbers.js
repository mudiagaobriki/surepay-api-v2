const randomString = (len) => {
    const p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return [...Array(len)].reduce((a) => a + p[~~(Math.random() * p.length)], '');
};

function generateAlphanumericOTP(length) {
    // Define characters to use in the OTP
    // const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const characters = '0123456789';
    let otp = '';

    // Get the length of the characters string
    const charactersLength = characters.length;

    // Generate random characters
    for (let i = 0; i < length; i++) {
        // Generate a random index within the range of the characters string
        const randomIndex = Math.floor(Math.random() * charactersLength);

        // Append the character at the random index to the OTP
        otp += characters.charAt(randomIndex);
    }

    return otp;
}

export {
    randomString,
    generateAlphanumericOTP,
};
